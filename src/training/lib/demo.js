// Demo build (VITE_DEMO=1) — what runs on the GitHub Pages deployment.
//
// Pages can only serve static files, so there is no API: passkey sign-in, per-profile sync
// and the admin dashboard all need the Node backend and are simply not part of a demo build.
// The app therefore stays in guest mode (everything in localStorage) and boots with a seeded
// example history (demoSeed.js), so the charts, heatmap, streaks and "last time you lifted…"
// pre-fills have something to show instead of an empty shell.
//
// Only these two constants are shared with normal builds: Vite replaces VITE_DEMO at build
// time, so the demo-only UI folds away and the seed generator — imported dynamically — never
// lands in a production bundle.
// FORMA: el entrenamiento se incrusta como una sección más, sin backend propio
// (passkeys, sync, admin). Por eso arranca siempre en modo demo/guest y siembra
// el perfil de ejemplo en localStorage. La sincronización real va por Supabase.
export const DEMO = true
export const DEMO_SEEDED = "forma_training_demo_seeded_v1"
