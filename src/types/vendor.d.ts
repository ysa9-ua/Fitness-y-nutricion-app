// Tipos para los módulos JavaScript vendorizados de FORMA (`src/training/`).
//
// Es una copia de la app original (AGPL-3.0) que no lleva tipos ni `.d.ts`, así
// que TypeScript no puede inferirlos con `allowJs` desactivado. Declararlos como
// `any` permite consumirlos desde el shell sin reescribirlos ni duplicarlos.
//
// Los ficheros propios del shell siguen siendo `.ts`/`.tsx` con tipos estrictos.
declare module "*.js"
declare module "*.jsx"
