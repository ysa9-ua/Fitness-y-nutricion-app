#!/usr/bin/env bash
# FORMA · Aplicar el esquema y los seeds a un proyecto alojado.
#
# Por que no es `supabase db push`: el host directo de un proyecto alojado
# (`db.<ref>.supabase.co`) solo resuelve a IPv6, asi que desde una maquina sin
# IPv6 global la conexion falla y el pooler no ayuda en un plan que no lo tenga.
# La Management API va por HTTPS, y eso si funciona.
#
# Lo que hace, en orden:
#   1. Borra todo lo que hay en el esquema `public` del proyecto.
#   2. Aplica las ocho migraciones, una consulta por migracion y en orden.
#   3. Aplica los cuatro seeds.
#   4. Registra el historial en `supabase_migrations.schema_migrations`.
#
# Es idempotente: se puede volver a ejecutar sin quejarse. El paso 1 borra todo
# `public` y el seed 04 borra su propio `auth.users` antes de insertarlo, porque
# un usuario que ya existe no dispara el trigger de alta y el perfil se queda
# sin crear.
#
# El paso 1 es destructivo y no tiene red de seguridad a proposito: el objetivo es
# que al terminar el proyecto sea exactamente lo que dicen las migraciones de
# este repositorio. No toca `auth`, `storage`, `graphql_public` ni `extensions`,
# que viven en otros esquemas.
#
# Uso, con las variables de entorno:
#
#   FORMA_REF=abc123def456 \
#   FORMA_ACCESS_TOKEN=sbp_... \
#   FORMA_SITE_URL=https://tu-sitio.example \
#     ./scripts/aplicar-remoto.sh
#
# `FORMA_SITE_URL` es opcional. Ajusta `site_url` de la configuracion de Auth,
# que es donde acaban los enlaces de los correos.

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

REF="${FORMA_REF:?falta FORMA_REF (el id del proyecto, en Project Settings > API)}"
TOKEN="${FORMA_ACCESS_TOKEN:?falta FORMA_ACCESS_TOKEN (un personal access token, no la clave del proyecto)}"
SITE_URL="${FORMA_SITE_URL:-}"

api="https://api.supabase.com/v1/projects/$REF"

# Envia una sentencia y devuelve su salida. Las que no devuelven filas imprimen
# nada, y eso es lo que se interpreta como "aplicada bien".
consulta() {
  python3 - "$1" <<'PY'
import json, sys, urllib.request, urllib.error

ref = __import__('os').environ['FORMA_REF']
tok = __import__('os').environ['FORMA_ACCESS_TOKEN']

body = json.dumps({"query": sys.argv[1]}).encode()
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{ref}/database/query",
    data=body, method="POST",
    headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
)
try:
    res = urllib.request.urlopen(req, timeout=180)
except urllib.error.HTTPError as e:
    detalle = e.read().decode()[:1200]
    sys.exit(f"ERROR HTTP {e.code}\n{detalle}")
except urllib.error.URLError as e:
    sys.exit(f"no se pudo contactar con la API: {e.reason}")

filas = json.load(res)
if isinstance(filas, dict):
    sys.exit(f"respuesta inesperada: {json.dumps(filas)[:1200]}")
for fila in filas:
    print(" | ".join(f"{k}={v}" for k, v in fila.items()))
PY
}

export FORMA_REF="$REF" FORMA_ACCESS_TOKEN="$TOKEN"

# ---------------------------------------------------------------------------
# 1. Limpieza
# ---------------------------------------------------------------------------
echo "1. Vaciando el esquema public de $REF"
consulta "
do \$\$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;
  for r in select c.relname from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('drop view if exists public.%I cascade', r.relname);
  end loop;
  for r in select t.typname from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype = 'e'
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) as args
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
  loop
    execute format('drop function if exists public.%I(%s) cascade', r.proname, r.args);
  end loop;
end
\$\$;"
echo "   public vacio"

# ---------------------------------------------------------------------------
# 2. Migraciones
# ---------------------------------------------------------------------------
echo
echo "2. Migraciones"
for f in "$DIR"/supabase/migrations/*.sql; do
  printf '   %-40s' "$(basename "$f")"
  salida="$(consulta "$(cat "$f")" 2>&1)" || {
    echo "FALLO"
    echo "$salida"
    exit 1
  }
  echo "OK"
done

# ---------------------------------------------------------------------------
# 3. Seeds
# ---------------------------------------------------------------------------
echo
echo "3. Seeds"
for f in "$DIR"/supabase/seeds/*.sql; do
  printf '   %-40s' "$(basename "$f")"
  salida="$(consulta "$(cat "$f")" 2>&1)" || {
    echo "FALLO"
    echo "$salida"
    exit 1
  }
  echo "OK"
done

# ---------------------------------------------------------------------------
# 4. Historial de migraciones
# ---------------------------------------------------------------------------
echo
echo "4. Registrando el historial en supabase_migrations.schema_migrations"
consulta "
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);"

registros=""
for f in "$DIR"/supabase/migrations/*.sql; do
  v="$(basename "$f" .sql)"
  n="$(basename "$f")"
  registros="$registros insert into supabase_migrations.schema_migrations
    (version, statements, name)
    values ('$v', array[]::text[], '$n')
    on conflict (version) do nothing;"
done
consulta "$registros"
# La API devuelve cada fila como `columna=valor` separado por barras, asi que
# el bucle de antes imprimia solo un guion bajo. Se separan los campos antes.
consulta "select version from supabase_migrations.schema_migrations order by version" \
  | while IFS= read -r fila; do
      echo "   ${fila#version=}"
    done

# ---------------------------------------------------------------------------
# 5. Comprobacion
# ---------------------------------------------------------------------------
echo
echo "5. Comprobacion"
consulta "
select
  (select count(*) from pg_tables where schemaname = 'public') as tablas,
  (select count(*) from pg_policies where schemaname = 'public') as politicas,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public') as funciones,
  (select count(*) from alimentos) as alimentos,
  (select count(*) from ejercicios) as ejercicios,
  (select count(*) from perfiles) as perfiles;"

if [ -n "$SITE_URL" ]; then
  echo
  echo "6. site_url de Auth -> $SITE_URL"
  curl -s -X PATCH "$api/config/auth" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"site_url\": \"$SITE_URL\"}" -o /dev/null -w '   [http %{http_code}]\n'
  echo "   La lista de redirecciones permitidas se cambia en el panel:"
  echo "   Authentication -> URL Configuration -> Redirect URLs"
fi

echo
echo "Listo. Para comprobarlo desde fuera:"
echo "  FORMA_API=https://$REF.supabase.co FORMA_ANON=<clave> \\"
echo "  FORMA_ISOLATION_EMAIL=algo@example.com ./scripts/check-api.sh"