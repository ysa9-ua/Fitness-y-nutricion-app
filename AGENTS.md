# FORMA

React + Vite + Tailwind CSS project, wrapped for Android by a single-`WebView` native host in `android/`.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work. Also owns the in-app navigation stack that backs the Android hardware back button
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `src/training/lib/` - Shared training logic (exercises, routines, history, sync) used by the native training screens. The rest of `src/training/` is the original AGPL-3.0 frontend, kept as vendored source
- `src/components/UI.tsx` - Shared controls, `BottomNav` (mobile/tablet) and `SideNav` (desktop)
- `src/lib/appData.ts` - Shared app state (diary, water, weights, favourites, own foods) with Supabase sync and offline cache
- `src/lib/backend.ts` - Profile reads/writes against Supabase (`perfiles`)
- `src/lib/supabase.ts` - Supabase client; `null` when `VITE_SUPABASE_*` is missing
- `dbb-supabase/supabase/migrations/` - Backend schema, including `estado_app` and RLS policies
- `src/screens/ExerciseLibrary.tsx` - Exercise picker: search, muscle-group figure filter (`BodyMap`), and the filtered list
- `src/components/BodyMap.tsx` - SVG body figure (front + back views, one path per muscle, tap to filter)
- `src/lib/muscles.ts` - Canonical taxonomy of the 13 muscle groups, the mapping of the exercise catalogue, and the bridge to the figure's muscle names
- `src/lib/nutritionPlan.ts` - Deterministic nutrition engine: energy/macros, daily menu, weekly shopping list, and persisted preferences
- `src/screens/NutritionPlan.tsx` - Nutrition plan screen: analysis, menu, and shopping tabs plus the preferences sheet
- `src/styles/nutrition-plan.css` - Styles for the plan screen and the diary entry card
- `public/favicon.svg` - Static files copied verbatim to the build output root
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React and Tailwind CSS v4 and the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Shell responsive y navegación

- `src/App.tsx` monta el shell completo: barra lateral en escritorio, barra
  inferior en móvil y tablet, y el contenido centrado con un ancho máximo. No
  hay marco de teléfono ni escenario de emulador en la web.
- `src/components/UI.tsx` expone `SideNav` y `BottomNav`; el breakpoint de
  escritorio es **900 px** y el panel de Inicio pasa a dos columnas a **1180 px**.
- `src/styles/base.css` define el layout (`app-stage`, `app-main`, `app-view`,
  `screen-stack`, `screen-body`) y los puntos de ruptura. En el WebView nativo
  `html[data-shell="native"]` solo ajusta las áreas seguras y la tipografía.
- La pila de navegación de `App.tsx` sigue alimentando el botón atrás de Android.

## Entrenamiento

La sección de entrenamiento es **nativa**, no un iframe: `src/screens/TrainingPlan.tsx`,
`WorkoutSession.tsx`, `RoutinesList.tsx`, `RoutineEditor.tsx`, `ExerciseLibrary.tsx`
y `WorkoutHistory.tsx` son pantallas de React del propio shell, y comparten el
estado con `src/store/trainingPlanStore.ts`. La lógica de ejercicios, rutinas,
historial e i18n vive en `src/training/lib/` (código vendorizado, AGPL-3.0).

- El entrenamiento arranca en **modo demo** (`DEMO = true`) y sirve los medios de
  ejercicio desde el CDN de jsDelivr. Si el entorno trae `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_PUBLISHABLE_KEY` (ver `.env.example`) y hay sesión abierta en
  FORMA, en vez del modo demo funciona como cliente real. El puente
  `src/training/lib/supabaseSync.js` sincroniza, en ambos sentidos:
  - las rutinas y el plan semanal → `planes_entrenamiento` + `rutinas` +
    `rutina_ejercicios`, como filas **propias del usuario**
    (`planes_entrenamiento.usuario_id`), encima del catálogo compartido. Al
    arrancar se hidratan de vuelta desde `semana_entrenamiento`, que prefiere el
    plan del usuario y cae al del catálogo.
  - el peso corporal → `mediciones_progreso`.
  - los entrenamientos terminados → `sesiones_entrenamiento` + `_ejercicios` +
    `_series`, y `registro_rutinas_diarias` cuando salen de una rutina.
- El catálogo de ejercicios (1324, ids de 4 dígitos) se siembra en `ejercicios`
  desde `scripts/generate-exercises.mjs` (salida generada
  `dbb-supabase/supabase/seeds/05_catalogo_ejercicios.sql`), así que conviven con
  los slugs del catálogo curado de FORMA.
- El mapeo entrenamiento → esquema de FORMA lo prueba `pnpm run check:sync`
  (`scripts/check-training-sync.mjs`) contra la pila local de `dbb-supabase/`,
  plan incluido.
- El código del entrenamiento es AGPL-3.0-or-later; la licencia se conserva en
  `src/training/LICENSE.txt`.

## Filtro muscular (figura SVG del cuerpo)

La biblioteca de ejercicios (`src/screens/ExerciseLibrary.tsx`) se filtra por
**grupo muscular** con una figura del cuerpo en SVG en lugar de los antiguos
chips. Antes hubo aquí un modelo 3D con Three.js (`src/lib/bodyModel.ts`); ya no
existe, y Three.js se ha quitado del `package.json`.

- `src/lib/muscles.ts` — taxonomía canónica de **13 grupos**: pecho, espalda,
  hombros, bíceps, tríceps, antebrazos, core, glúteos, cuádriceps,
  isquiotibiales, pantorrillas, cuello y cardio. Normaliza los 50 nombres crudos
  del catálogo de ejercicios (`mg` = grupo principal, `tg` = secundario, `sm` =
  otros, `bp` = parte del cuerpo). Regla: `principal = zona(bp) ?? zona(mg) ??
  zona(tg)`, salvo `bp` = cardio/neck (que son regiones, no músculos) que mandan;
  el resto de músculos pasan a "involucrados".
- `src/lib/muscles.ts` (segunda mitad) — el puente con la figura: la geometría
  habla en **19 nombres de músculo** (`FIGURE_MUSCLES`), que se agrupan en los
  13 grupos con `ZONE_FIGURE_MUSCLES` y se traducen de vuelta con
  `FIGURE_MUSCLE_ZONE` (lo que se usa al tocar un músculo). `FIGURE_MUSCLE_LABEL`
  pone el nombre en español de cada uno.
- `src/training/lib/body-paths.js` — la geometría: paths SVG del cuerpo
  masculino, frontal (`viewBox 0 95 727 1280`) y trasero (`718 95 727 1280`),
  con una lista de rutas por parte del cuerpo. Son ~100 KB, así que
  `src/components/BodyMap.tsx` los pide con `import()` dinámico (cacheados a
  nivel de módulo) en vez de meterlos en el bundle principal.
- `src/components/BodyMap.tsx` — el componente React: dos `<svg>` (frontal y
  trasero) con una ruta por músculo, toque para filtrar, badge con el grupo
  elegido y leyenda de chips con contadores.
- `src/styles/bodymap.css` — estilos de la figura; importado al final de
  `src/index.css`.
- `scripts/check-muscle-zones.mjs` — valida que los 50 nombres del catálogo
  están mapeados y vuelca los recuentos por grupo.

Detalles que conviene no olvidar:

- **La figura es SVG, no WebGL.** No hay canvas niThree.js: son paths que el
  navegador pinta, así que funciona igual en el emulador (SwiftShader) que en
  un móvil, y no necesita contexto WebGL ni degradado.
- **La paleta es monocroma.** El visor tiene fondo fijo `#1c1c1e`, la silueta
  (cabeza, pelo, manos, pies, rodillas y tobillos) es `#3a3a41`, los músculos en
  reposo `#4a4a52` y el grupo seleccionado se pinta en **blanco puro**
  (`#ffffff`) con un halo; el resto se atenúa a 0.32. Las separaciones entre
  piezas son el propio fondo (stroke del color del visor), que es lo que da el
  aspecto "seccionado".
- **Cada músculo es un `<path>` independiente**, así que el toque va al grupo
  canónico directamente (`FIGURE_MUSCLE_ZONE`), sin raycasting ni geometría
  calculada. Un grupo puede caer en varios músculos (espalda = trapecio +
  espalda alta + espalda baja) y un músculo puede estar en dos vistas.
- **El cuello cuenta como músculo** (en el catálogo original es silueta): es el único
  grupo canónico sin equivalente real, y así se puede resaltar. El cardio es
  una modalidad, no un músculo: **no tiene zona en la figura** y se avisa en el
  texto de ayuda.
- **La leyenda es el fallback y el resumen.** Sigue habiendo una fila de chips
  con los 13 grupos y su contador, que es lo que se usa desde el teclado o
  cuando no se quiere tocar la figura.
- La geometría es SVG propia del entrenamiento; su licencia se conserva en
  `src/training/LICENSE.txt`.

## Supabase (web)

- `src/lib/supabase.ts` — cliente del shell. La URL y la clave publicable salen
  de `VITE_SUPABASE_*`; sin ellas `supabase` es `null` y la app se queda en modo
  local/demo (nunca lanza). Ver `.env.example` y el `.env` local.
- `src/lib/backend.ts` — perfil del usuario (`perfiles`): lectura, `guardarPerfil`
  y `onboardingAPerfil`. El entrenamiento tiene su propio puente en
  `src/training/lib/supabaseSync.js` porque vive en otro bundle.
- `src/lib/appData.ts` — **fuente de verdad del diario, pesos, favoritos,
  comidas y alimentos propios**: tabla `public.estado_app` (JSONB por
  `usuario_id`). `hidratarDatos()` lee el documento remoto al arrancar y tras el
  login; los cambios se guardan con un debounce de 1,2 s y se reintentan al
  volver la conexión. `localStorage` (`forma:app-data`) queda como caché offline
  y `forma:app-data-pending` marca lo que falta por subir. El documento lleva
  `savedAt` y la hidratación lo compara con `actualizado_en` de la fila remota:
  si el cambio local es más reciente, se sube aunque el marcador de pendiente se
  haya perdido (Chromium vuelca `localStorage` a disco de forma asíncrona y un
  cierre abrupto puede perder el último lote).
- `src/App.tsx` y `src/screens/Auth.tsx` — acceso, alta y cierre de sesión contra
  Supabase Auth. La sesión se guarda en `localStorage` (`storageKey: "forma-auth"`)
  y la comparten todas las pantallas de la app, que son del mismo origen. Si el
  perfil remoto tiene `onboarding_completado`, el login salta el onboarding.
- **El splash no se queda esperando al backend.** `finishSplash` (`src/App.tsx`)
  consulta la sesión a Supabase pero con **red de cortesía de 3 s**: si el
  servidor no contesta (pila local apagada, móvil sin cobertura, donde la
  petición se queda colgada minutos), la app arranca igual en modo local con la
  marca `forma:session` de `localStorage`. Sin ese corte, la pantalla de carga
  no se acababa nunca.
- `dbb-supabase/` es el backend; `dbb-supabase/scripts/check-api.sh` valida la
  API y `pnpm run check:sync` valida la sincronización del entrenamiento.

## Nutrición (plan personalizado)

- `src/lib/nutritionPlan.ts` — motor local y determinista (sin IA ni API). Con
  los datos del perfil calcula BMR (Katch-McArdle si hay `% grasa`, si no
  Mifflin-St Jeor), TDEE por factor de actividad, ajuste por objetivo, macros
  (proteína sobre masa magra/peso, grasa mínima por kg, carbohidratos cierran
  las kcal), un día de comidas y la compra ×7.
- `src/screens/NutritionPlan.tsx` — pantalla de la ruta `nutrition-plan`, a la
  que se entra desde la tarjeta `nutrition-plan-cta` del diario. Tiene tres
  pestañas (Análisis, Menú, Compra) y una hoja de preferencias con objetivo,
  actividad, número de comidas, alimentos preferidos y exclusiones.
- **Las metas del diario salen del mismo motor.** `Nutrition.tsx` llama a
  `analizarPerfil`/`cargarPreferencias` en vez de usar las constantes fijas de
  antes (2.150 kcal, 160/220/70 g, 2 L), así que el diario y el plan no enseñan
  cifras distintas.
- Las preferencias se guardan en `localStorage` con la clave
  `forma:nutrition-plan`; sin backend la pantalla funciona igual.
- El menú usa los alimentos elegidos y añade 150 g de verdura en las comidas
  principales; nunca incluye nada de la lista de exclusiones. Si una categoría
  se queda vacía, cae a alternativas permitidas y avisa en pantalla.
- La lista de la compra agrupa por Proteínas/Carnicería, Frutería/Verdulería,
  Carbohidratos/Despensa y Grasas/Lácteos, con cantidades para 7 días.
- `OnboardingData` (`src/screens/Onboarding.tsx`) y `perfilAOnboarding`
  (`src/lib/backend.ts`) llevan `sex` y los perímetros `neck`/`waist`/`hips`
  para que el cálculo no dependa solo de edad, peso y altura.

## Biblioteca de alimentos y datos compartidos

- `src/lib/foodLibrary.ts` — catálogo curado de **28 cadenas** españolas
  (Mercadona, Carrefour, Lidl, Aldi, Alcampo, Eroski, DIA, Consum, Hipercor,
  Ahorramás, Gadis, Froiz, Bonpreu, Condis, Caprabo, Masymas, Covirán, Spar,
  Alimerka, BM, Supercor, Sánchez Romero, Suma, Plusfresc, Ametller Origen,
  Veritas, Gros Mercat y La Sirena) y ~190 productos. Mezcla **genéricos**
  disponibles en cualquier cadena (`chain: "todas"`), **marcas por cadena** y
  **alimentos propios** del usuario. No es exhaustivo y los valores son
  orientativos por 100 g; la pantalla lo avisa.
- `src/lib/productSearch.ts` — cliente de la base abierta de productos envasados
  que alimenta el buscador para buscar por nombre o código de barras. La UI lo
  presenta como FORMA. Sin backend propio: si la red falla, la app sigue con el
  catálogo curado. Usa `/cgi/search.pl` (texto) y
  `/api/v2/product/{code}.json` (código), los dos con CORS abierto. Respeta
  los límites de la API: **solo busca al enviar**, espera 6,5 s entre búsquedas
  y 4,5 s entre productos, y cachea 30 días en `localStorage`
  (`forma:product-cache`). Mapea a `LibraryProduct`, deduce la sección y la cadena
  española por la marca (Hacendado → Mercadona, Milbona → Lidl…) y usa el
  `serving_size` en gramos como ración, nunca el tamaño del envase.
- `src/screens/FoodLibrary.tsx` — ruta `food-library`. Busca sin acentos,
  filtra por origen (todos / favoritos / propios), cadena y sección, marca
  favoritos y abre una hoja con cantidad, comida de destino y macros. Desde la
  ficha se apunta al diario, se crea un alimento propio con los valores de la
  etiqueta o se **guarda en la biblioteca** un producto que solo existía en la
  base remota (`Guardar en mi biblioteca`, oculto si ya está). El alta manual se
  abre con el `+` del encabezado. Los alimentos propios llevan un badge de
  origen (**Manual**, **Escáner**, **FORMA**) y se pueden eliminar desde su ficha
  con «Quitar de mi biblioteca». El buscador filtra el catálogo local mientras
  se escribe y consulta la base remota al pulsar Intro o el botón; los
  resultados traen foto, Nutri-Score y EAN, y los errores (sin red, saturado,
  límite) se explican en español con opción de reintentar.
- Los favoritos y los alimentos propios **entran en la rotación del menú del
  plan**: `generarPlan(profile, prefs, extraFoods)` recibe
  `alimentosDeFavoritos(...)` y añade esos productos a la rotación y a la lista
  de la compra, aunque no estén marcados en los chips de preferencias. El día
  base no tiene por qué incluir todos los favoritos: con "Variar" van
  apareciendo. Los snacks y las bebidas se pueden apuntar al diario, pero
  quedan fuera del menú (`planEligible: false`). Un favorito de la base remota
  se resuelve desde la caché aunque la búsqueda ya no esté en pantalla.
- `scripts/check-food-library.mjs` — `pnpm run check:food` valida el catálogo
  curado (ids, cadenas, secciones, macros y raciones) y el mapeo de la base
  remota con productos de ejemplo: nombre en español, kJ → kcal, cadena por
  marca, ración, secciones, exclusión de bebidas, código de barras, caché y
  favoritos en el plan. También prueba la retroalimentación: categoría deducida
  por energía de los macros, escalado de la ración escaneada y upsert de
  `guardarAlimentoPersonalizado` por nombre o por código de barras.
- `src/lib/appData.ts` — almacén compartido con el diario por fecha, el agua, los
  pesos y perímetros de los check-ins, los favoritos, las comidas propias y los
  alimentos propios. La fuente de verdad es `public.estado_app` en Supabase; la
  copia de `localStorage` (`forma:app-data`) es la caché offline. Usa
  `useSyncExternalStore`, así que **Inicio, Diario y Progreso se refrescan a la
  vez** en cuanto cambia algo.
- **Alimentos propios:** `customFoods` guarda las raciones que añade el usuario.
  `CustomFood.source` distingue `manual`, `scanner` y `lookup`, y la
  ficha conserva `brand`/`barcode` si existen. `guardarAlimentoPersonalizado`
  hace **upsert**: si el código de barras coincide (o el nombre normalizado,
  cuando ninguno tiene código) actualiza la ficha en vez de duplicarla.
  `claveAlimento` ignora acentos, mayúsculas y espacios; el mismo criterio
  reutiliza una comida ya creada con ese nombre. `alimentoDesdePer100` y
  `alimentoDesdeProducto` (`src/lib/foodLibrary.ts`) convierten valores por
  100 g en la ración guardada y deducen la categoría por la energía de los
  macros.
- **El escáner también alimenta la biblioteca:** `FoodDetail` trae un
  interruptor «Guardar en mi biblioteca» activado por defecto. Al guardar,
  `App.tsx` apunta el alimento al diario y, si el interruptor sigue activo, lo
  guarda como `source: "scanner"` con la ración escaneada.
- **Comidas propias del día:** `customMeals` (por fecha) guarda las comidas que
  se crean desde la hoja «Añadir comida» del Diario: almuerzo, recena, 6ª comida
  o un nombre libre con hora. El formulario de **nombre editable** es el paso
  principal; las sugerencias (Desayuno, Almuerzo, Comida, Merienda, Cena,
  Recena, 6ª comida) solo lo rellenan junto con la hora, y el usuario puede
  cambiarlo antes de crear. Si ya hay una comida con ese nombre normalizado, se
  reutiliza en vez de duplicarla. Se guardan aunque estén vacías y sobreviven a
  la recarga; `agregarComidaDiaria`/`eliminarComidaDiaria` las gestionan. Los
  botones «+» de cada comida abren la biblioteca con esa comida como destino
  (`food-library-target`), y la ficha del alimento la deja preseleccionada.
- **Siembra de demostración:** `sembrarDiaDemo(hoy, plan.meals)` deja el día de
  hoy con todas las comidas del plan menos la última y 1.750 ml de agua. Es
  idempotente: si el día ya tiene datos, no toca nada.
- **Inicio no tiene cifras fijas.** `Dashboard.tsx` calcula las kcal y macros
  del diario real, el agua, el último peso del check-in y los entrenos de la
  semana. Sin backend lee `gym_state_v1` (el estado local del entrenamiento) con
  `leerEstadoLocal`/`rutinaDelDia`; con Supabase usa `semanaEntrenamiento`.
- **Progreso sale de los mismos datos.** `Progress.tsx` dibuja la gráfica con
  `data.weights`, la cintura con el último check-in y el volumen de fuerza con
  `progresoFuerza` o con el historial local del entrenamiento.
- El check-in semanal (`WeeklyCheckInScreen`) guarda peso, cintura, cadera y
  cuello en `registrarPeso`, además de actualizar el perfil. El escáner OCR
  (`FoodDetail`) apunta el alimento al diario con `agregarAlimentoDiario`,
  mapeando Desayuno/Almuerzo/Cena/Snack a `breakfast/lunch/dinner/snack`.

## Android

- `android/` - Gradle project wrapping the web app in a single `WebView` activity.
  Build with `./gradlew webBuild assembleDebug` from `android/`.
- The `android` Vite mode (`--mode android`, wired to `pnpm build:android`)
  switches `base` to `./` so asset URLs stay relative, which is what the APK
  needs. Keep using the default mode for the browser.
- The web build is fully responsive, so the WebView renders full-screen without
  a phone frame. `src/main.tsx` tags the document with `data-shell="native"`
  when it detects `window.FORMA_NATIVE`; `src/styles/base.css` uses that marker
  only for safe-area padding and native typography.
- The native shell calls `FORMA_NATIVE.setCanGoBack(...)` so the hardware back
  button follows the in-app navigation stack before closing the app.

## iOS

iOS is delivered as an installable PWA (`public/manifest.webmanifest` plus
`public/sw.js`), not as a native app. A native iOS build requires macOS and
Xcode, so it can be neither produced nor verified from Linux. The service worker
registers only in production web builds; the minifier drops the call from the
Android bundle entirely, because a cache there would serve stale content after
an app update.

- `public/sw.js` - offline shell, hashed-asset cache, and Google Fonts cache
- `scripts/generate-icons.py` - regenerates the PWA PNG icons from the brand mark
- `scripts/check-pwa.mjs` - validates manifest, icon sizes, service worker, asset paths

Run `pnpm run check:pwa` after a build. `android/app/build.gradle.kts` excludes
the PWA-only files from the APK.

## Dependencies

- Runtime: React 19 and React DOM 19
- Backend: `@supabase/supabase-js` (auth + datos del web app)
- Entrenamiento: Zustand 5 (used by `src/store/trainingPlanStore.ts`)
- Figura muscular: SVG puro (sin librería): los paths vienen de `src/training/lib/body-paths.js`
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt (running it reformats the vendored `src/training/` files too)

**Ojo con oxfmt y los tipos en línea**: el formateador elimina el `;` de los
tipos objeto escritos en una sola línea (`{ a: string; b: number }` →
`{ a: string b: number }`, que no compila). Los tipos con más de una propiedad
se escriben en varias líneas o con un `type` con nombre.

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.
