#!/usr/bin/env node
/**
 * Comprueba que la taxonomía de grupos musculares de src/lib/muscles.ts cubre
 * todos los nombres de musculatura del catálogo (mg, tg y sm) y que ningún
 * ejercicio se queda sin clasificar.
 *
 * Uso:  node scripts/check-muscle-zones.mjs
 */

import { EXDB } from "../src/training/lib/exercises-data.js"
import { MUSCLE_ZONES, zoneOfRaw, musclesOf } from "../src/lib/muscles.ts"

const problems = []
const notes = []

const ZONE_IDS = new Set(MUSCLE_ZONES.map((z) => z.id))

// 1. Todo nombre crudo del dataset debe estar mapeado a un grupo.
const crudos = new Set()
for (const ex of EXDB) {
  if (ex.mg) crudos.add(ex.mg)
  if (ex.tg) crudos.add(ex.tg)
  for (const m of ex.sm || []) crudos.add(m)
}
const sinMapear = [...crudos].filter((n) => !zoneOfRaw(n)).sort()
if (sinMapear.length) {
  problems.push(`Nombres de musculatura sin mapear: ${sinMapear.join(", ")}`)
} else {
  notes.push(`${crudos.size} nombres del catálogo mapeados`)
}

// 2. Todo ejercicio debe tener un grupo principal.
const sinPrincipal = EXDB.filter((ex) => !musclesOf(ex).primary)
if (sinPrincipal.length) {
  const muestra = sinPrincipal.slice(0, 5).map((e) => `${e.id} (${e.n})`)
  problems.push(
    `${sinPrincipal.length} ejercicios sin grupo principal: ${muestra.join(", ")}`,
  )
}

// 3. Recuento por grupo: principales e involucrados.
console.log("grupo          principal  involucrado  total")
const filas = []
for (const zona of MUSCLE_ZONES) {
  let principal = 0
  let involucrado = 0
  for (const ex of EXDB) {
    const m = musclesOf(ex)
    if (m.primary === zona.id) principal++
    else if (m.involved.includes(zona.id)) involucrado++
  }
  filas.push({ id: zona.id, principal, involucrado })
  console.log(
    `${zona.id.padEnd(14)} ${String(principal).padStart(8)} ${String(involucrado).padStart(11)} ${String(principal + involucrado).padStart(6)}`,
  )
}
const vacios = filas.filter((f) => f.principal + f.involucrado === 0)
if (vacios.length) {
  problems.push(
    `Grupos sin ningún ejercicio: ${vacios.map((f) => f.id).join(", ")}`,
  )
}
const sinPrincipalZona = filas.filter((f) => f.principal === 0)
if (sinPrincipalZona.length) {
  notes.push(
    `Grupos sin ejercicios principales (solo involucrados): ${sinPrincipalZona.map((f) => f.id).join(", ")}`,
  )
}

// 4. Los identificadores de zona deben ser únicos.
if (ZONE_IDS.size !== MUSCLE_ZONES.length) {
  problems.push("Hay identificadores de zona duplicados")
}

for (const n of notes) console.log(`\nOK  ${n}`)
if (problems.length) {
  console.error("\nFALLO:")
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log("\nTODO CORRECTO")
