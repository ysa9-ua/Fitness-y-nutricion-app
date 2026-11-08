#!/usr/bin/env bash
# FORMA · Comprobacion de la API en local.
#
# Los tests de `supabase/test db` comprueban el SQL. Este script comprueba lo que
# solo se ve desde fuera: que el usuario de demostracion puede iniciar sesion,
# que PostgREST le devuelve sus datos y que el RLS tambien ahi impide ver los de
# otro usuario.
#
# Es lo que detecto el fallo de `aud`/`role` en `auth.users`: el perfil existia,
# los tests de SQL pasaban, y el login respondia "Invalid login credentials".
# Nada de eso se ve desde dentro de la base de datos.
#
# Uso, con la pila local levantada (`npx supabase start`):
#
#   ./scripts/check-api.sh
#
# Las claves se leen de `npx supabase status`. Si el puerto no es el 54321 de
# por defecto, se puede pasar como primer argumento.
#
# Para apuntar a otro sitio (por ejemplo, el proyecto alojado) hay que dar las
# claves por entorno, en vez de leerlas de la pila local:
#
#   FORMA_API=https://TU-PROYECTO.supabase.co FORMA_ANON=sb_publishable_... \
#     ./scripts/check-api.sh
#
# `FORMA_ANON` acepta tanto la anon clasica como la publishable nueva. En el
# repositorio no hay ninguna clave de verdad: las de desarrollo salen de
# `npx supabase status` y las de produccion, del entorno.

set -euo pipefail

API="${1:-${FORMA_API:-http://127.0.0.1:54321}}"
EMAIL="${FORMA_EMAIL:-demo@forma.test}"
PASSWORD="${FORMA_PASSWORD:-forma2026}"

fallos=0

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

ok() { printf '  \033[32mok\033[0m    %s\n' "$1"; }
mal() { printf '  \033[31mFALLO\033[0m %s\n' "$1"; fallos=$((fallos + 1)); }

# `curl` en modo silencioso, que devuelve el cuerpo y el codigo HTTP separado por
# un salto de linea. Se imprime solo el cuerpo, que es lo que hay que comprobar.
api() {
  curl -s -H "apikey: $ANON" "$@"
}

# Cuenta las filas que devuelve una consulta, o escribe el error.
cuenta() {
  python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("no-json"); sys.exit()
print(len(d) if isinstance(d, list) else "error")
'
}

# ---------------------------------------------------------------------------
# Claves
# ---------------------------------------------------------------------------

if [ -n "${FORMA_ANON:-}" ]; then
  # Claves del entorno: es lo que hay que usar contra un proyecto que no sea la
  # pila local, porque `npx supabase status` solo describe la local.
  ANON="$FORMA_ANON"
  PUBLISHABLE="$ANON"
  echo "Usando las claves de FORMA_ANON contra $API"
else
  echo "Leyendo las claves de \`npx supabase status\`..."
  # `-o json`, no `--json`: el flag largo no existe y la CLI responde con su
  # pantalla de ayuda en vez de un error, asi que el script leeria texto.
  status="$(npx supabase status -o json 2>/dev/null || true)"

  ANON="$(printf '%s' "$status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ANON_KEY",""))' 2>/dev/null || true)"
  PUBLISHABLE="$(printf '%s' "$status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("PUBLISHABLE_KEY",""))' 2>/dev/null || true)"

  if [ -z "$ANON" ] && [ -z "$PUBLISHABLE" ]; then
    echo "No se pudo leer la ANON_KEY. Is la pila local levantada?" >&2
    echo "Si es normal, da la clave por entorno: FORMA_ANON=... $0" >&2
    exit 1
  fi
fi

# Las claves nuevas (`sb_publishable_...`) se aceptan igual que la anon clasica.
[ -z "$ANON" ] && ANON="$PUBLISHABLE"

# ---------------------------------------------------------------------------
# 1. El usuario de demostracion puede iniciar sesion
# ---------------------------------------------------------------------------

echo
echo "1. Inicio de sesion"

login="$(api -X POST "$API/auth/v1/token?grant_type=password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"

TOKEN="$(printf '%s' "$login" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"

if [ -n "$TOKEN" ]; then
  ok "$EMAIL inicia sesion con '$PASSWORD'"
else
  mal "$EMAIL no puede iniciar sesion: $(printf '%s' "$login" | head -c 120)"
  echo
  echo "Si falla con 'Invalid login credentials', el seed 04 no escribio"
  echo "\`aud\`/\`role\` o el hash salio con un coste bcrypt menor de 10."
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN")

# El JWT es la fuente de \`auth.uid()\`, asi que todas las politicas dependen de el.
claims="$(printf '%s' "$TOKEN" | cut -d. -f2 | python3 -c '
import base64, json, sys
p = sys.stdin.read().strip()
p += "=" * (-len(p) % 4)
print(json.loads(base64.urlsafe_b64decode(p)).get("sub", ""))
')"

if [ "$claims" = "11111111-1111-4111-8111-111111111111" ]; then
  ok "el JWT lleva el sub del usuario de demostracion"
else
  mal "el sub del JWT es '$claims'"
fi

# ---------------------------------------------------------------------------
# 2. PostgREST devuelve los datos propios
# ---------------------------------------------------------------------------

echo
echo "2. Lectura de los datos propios a traves de PostgREST"

perfil="$(api "${AUTH[@]}" "$API/rest/v1/perfiles?select=nombre_usuario,calorias_objetivo&limit=1")"

if printf '%s' "$perfil" | python3 -c '
import json, sys
d = json.load(sys.stdin)
sys.exit(0 if d and d[0].get("nombre_usuario") == "lucia" else 1)
' 2>/dev/null; then
  ok "el perfil propio es legible"
else
  mal "el perfil propio no se lee: $(printf '%s' "$perfil" | head -c 120)"
fi

# Cada tabla tiene que devolver filas. Si alguna sale a cero, el seed 04 dejo la
# historia a medias y las graficas saldrian vacias sin avisar.
#
# La columna que se pide es la clave primaria de cada tabla, que no es siempre
# `id`: `perfiles` usa `auth_id` y `registro_agua` tiene clave compuesta (un
# registro de agua por usuario y dia). Pedir `id` a proposito devuelve un
# 42703 de PostgREST, que es como se detecta el desajuste.
while read -r tabla columna; do
  n="$(api "${AUTH[@]}" "$API/rest/v1/$tabla?select=$columna&limit=1000" | cuenta)"

  case "$n" in
    error|no-json) mal "$tabla no es legible" ;;
    0)             mal "$tabla devuelve cero filas" ;;
    *)             ok "$tabla devuelve $n filas" ;;
  esac
done <<'TABLAS'
mediciones_progreso id
check_ins id
diario_comidas id
diario_alimentos id
sesiones_entrenamiento id
sesiones_ejercicios id
sesiones_series id
registro_agua fecha
registro_rutinas_diarias id
escaneos_ocr id
TABLAS

# Estas dos pueden estar vacias sin que sea un fallo: el usuario de demostracion
# no sube fotos, y `sesiones_ejercicios` solo se crea al abrir una sesion. Lo que
# importa es que se puedan leer y escribir.
for tabla in fotos_progreso; do
  codigo="$(curl -s -o /dev/null -w '%{http_code}' \
    "${AUTH[@]}" -H "apikey: $ANON" "$API/rest/v1/$tabla?select=id&limit=1")"
  if [ "$codigo" = "200" ]; then
    ok "$tabla es legible (vacia, sin filas de ejemplo)"
  else
    mal "$tabla no es legible: HTTP $codigo"
  fi
done

# El catalogo es legible por cualquier sesion y no depende del usuario.
for tabla in alimentos ejercicios v_rutinas_completas; do
  n="$(api "${AUTH[@]}" "$API/rest/v1/$tabla?select=id&limit=1000" | cuenta)"

  case "$n" in
    error|no-json|0) mal "el catalogo $tabla no es legible" ;;
    *)               ok "el catalogo $tabla devuelve $n filas" ;;
  esac
done

# ---------------------------------------------------------------------------
# 3. Los RPC responden
# ---------------------------------------------------------------------------

echo
echo "3. Los agregados"

hoy="$(date +%F)"

rpc() {
  api "${AUTH[@]}" -X POST "$API/rest/v1/rpc/$1" \
    -H 'Content-Type: application/json' -d "$2"
}

kcal="$(rpc resumen_nutricion "{\"p_fecha\":\"$hoy\"}" | \
  python3 -c 'import json,sys; print(json.load(sys.stdin).get("kcal",""))' 2>/dev/null || true)"

if [ -n "$kcal" ] && [ "$kcal" -gt 0 ] 2>/dev/null; then
  ok "resumen_nutricion devuelve $hoy $kcal kcal"
else
  mal "resumen_nutricion no devuelve kcal para $hoy"
fi

for funcion in '{"p_rango":"3M"}' ; do
  n="$(rpc serie_peso "$funcion" | cuenta)"
  case "$n" in
    error|no-json|0) mal "serie_peso devuelve una lista vacia" ;;
    *)               ok "serie_peso devuelve $n puntos" ;;
  esac
done

racha="$(rpc racha_nutricion '{}' | python3 -c 'import json,sys; print(json.load(sys.stdin))' 2>/dev/null || true)"

if [ -n "$racha" ] && [ "$racha" -gt 0 ] 2>/dev/null; then
  ok "racha_nutricion devuelve $racha dias"
else
  mal "racha_nutricion devuelve '$racha'"
fi

# ---------------------------------------------------------------------------
# 4. El RLS tambien ahi impide ver datos ajenos
# ---------------------------------------------------------------------------

echo
echo "4. Aislamiento entre usuarios por la API"

# El dominio del usuario de prueba es configurable porque no todos los entornos
# aceptan el mismo. La pila local admite el TLD reservado `.test` (RFC 6761), que
# es lo que se usa por defecto; un proyecto alojado lo rechaza con
# `email_address_invalid` y hay que pasar uno real:
#
#   FORMA_ISOLATION_EMAIL=algo@example.com ./scripts/check-api.sh
#
# El alta tiene que estar confirmada para poder entrar despues. En la pila local
# `mailer_autoconfirm` viene en `true`; en un proyecto real hay que activarlo en
# el panel o confirmar el correo a mano.
AISLAMIENTO="${FORMA_ISOLATION_EMAIL:-aislamiento@forma.test}"
AISLAMIENTO_PW="aislamiento123"

# El script se puede repetir, asi que si el usuario ya existe de una corrida
# anterior hay que entrar con la contraseña en vez de fallar con un 422
# "user_already_exists". `SIGNUP` se descarta y solo cuenta `LOGIN`.
otro="$(
  api -X POST "$API/auth/v1/signup" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$AISLAMIENTO\",\"password\":\"$AISLAMIENTO_PW\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true
)"

if [ -z "$otro" ]; then
  otro="$(
    api -X POST "$API/auth/v1/token?grant_type=password" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$AISLAMIENTO\",\"password\":\"$AISLAMIENTO_PW\"}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true
  )"
fi

if [ -z "$otro" ]; then
  mal "no se pudo crear el segundo usuario para la prueba de aislamiento"
  echo "  Si el alta falla con email_address_invalid, el dominio $AISLAMIENTO"
  echo "  no lo admite este entorno: pasa otro con FORMA_ISOLATION_EMAIL."
  echo "  Si falla con 429, se ha superado el limite de correos por hora."
  echo "  Si falla al entrar, la cuenta existe pero sin confirmar el correo."
else
  ok "el segundo usuario existe"

  for tabla in mediciones_progreso check_ins diario_comidas \
                diario_alimentos sesiones_entrenamiento; do
    n="$(api -H "Authorization: Bearer $otro" \
           "$API/rest/v1/$tabla?select=id&limit=1000" | cuenta)"

    if [ "$n" = "0" ]; then
      ok "$tabla no deja ver nada del usuario de demostracion"
    else
      mal "$tabla devuelve $n filas de otro usuario (deberia ser 0)"
    fi
  done

  # Escribir en nombre de otro tiene que fallar, no crear la fila en silencio.
  codigo="$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$API/rest/v1/diario_comidas" \
    -H "apikey: $ANON" -H "Authorization: Bearer $otro" \
    -H 'Content-Type: application/json' \
    -d '{"usuario_id":"11111111-1111-4111-8111-111111111111","fecha":"'$hoy'","tipo_comida":"snack","titulo":"Inyeccion"}')"

  if [ "$codigo" -ge 400 ]; then
    ok "insertar en nombre de otro se rechaza con HTTP $codigo"
  else
    mal "insertar en nombre de otro devolvio HTTP $codigo (deberia ser 4xx)"
  fi

  # El usuario de prueba se borra al terminar: no debe quedarse en el seed.
  id="$(api -H "Authorization: Bearer $otro" \
        "$API/rest/v1/perfiles?select=auth_id" \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["auth_id"] if d else "")' 2>/dev/null || true)"
  [ -n "$id" ] && curl -s -o /dev/null -X DELETE \
    "$API/rest/v1/perfiles?auth_id=eq.$id" \
    -H "apikey: $ANON" -H "Authorization: Bearer $otro"
fi

# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------

echo
if [ "$fallos" -eq 0 ]; then
  printf '\033[32mTodo correcto.\033[0m\n'
  exit 0
else
  printf '\033[31m%d comprobaciones fallaron.\033[0m\n' "$fallos"
  exit 1
fi
