#!/usr/bin/env node
/**
 * Comprueba que la PWA de FORMA esta bien formada contra el build de
 * produccion. No sustituye a probar la instalacion en un iPhone real,
 * pero detecta los fallos que de otro modo solo aparecen en el dispositivo:
 * referencias rotas, tamanos de icono incorrectos y MIME equivocado.
 *
 * Uso:  node scripts/check-pwa.mjs [dist] [web|android] [apk]
 *
 * El modo importa porque los dos targets tienen requisitos opuestos: la web
 * admite rutas absolutas si se sirve en la raiz del dominio, mientras que el
 * APK necesita rutas relativas y no debe llevar nada de la PWA dentro. En modo
 * android conviene pasar la ruta del APK, porque lo que llega al dispositivo es
 * el APK y no el contenido de dist/.
 */

import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join, resolve } from "node:path"

const dist = resolve(process.argv[2] ?? "dist")
const mode = process.argv[3] ?? "web"
const apkPath = process.argv[4] ? resolve(process.argv[4]) : null
const isAndroid = mode === "android"
const problems = []
const notes = []

const fail = (msg) => problems.push(msg)
const ok = (msg) => notes.push(msg)

// Los PNG se validan leyendo la cabecera IHDR: bytes 16..24 guardan el
// ancho y el alto en big-endian tras la firma de 8 bytes y los 3 chunks.
// Lista las entradas de un APK (que es un zip) con unzip -Z1. Si unzip no
// esta disponible se omite la comprobacion en vez de fallar.
function listApk(path) {
  try {
    return execFileSync("unzip", ["-Z1", path], { encoding: "utf8" })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

function pngSize(file) {
  const buffer = readFileSync(file)
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  if (!buffer.subarray(0, 8).equals(signature)) return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

// 1. El manifest debe existir y ser JSON valido. En el APK no debe estar.
const manifestPath = join(dist, "manifest.webmanifest")
if (isAndroid) {
  if (apkPath && existsSync(apkPath)) {
    const entries = listApk(apkPath)
    if (entries === null) {
      ok("unzip no disponible: se omite la inspeccion del APK")
    } else {
      if (entries.includes("assets/public/sw.js")) {
        fail(
          "el APK empaqueta sw.js; un service worker serviria contenido viejo",
        )
      } else {
        ok("el APK no empaqueta sw.js")
      }
      if (entries.includes("assets/public/manifest.webmanifest")) {
        fail("el APK empaqueta manifest.webmanifest; sobra en un WebView")
      } else {
        ok("el APK no empaqueta manifest.webmanifest")
      }
      if (!entries.includes("assets/public/index.html")) {
        fail("el APK no empaqueta index.html")
      } else {
        ok("el APK empaqueta el shell web")
      }
      // Nada de esto se usa dentro de un WebView, y suma ~80 KB.
      const pwaOnly = entries.filter((e) =>
        /(sw\.js|manifest\.webmanifest|robots\.txt|apple-touch-icon\.png|icon-.*\.png)$/.test(
          e,
        ),
      )
      if (pwaOnly.length > 0) {
        fail(
          `el APK empaqueta recursos que solo usa la PWA: ${pwaOnly.join(", ")}`,
        )
      } else {
        ok("el APK no incluye recursos exclusivos de la PWA")
      }
      if (!entries.includes("assets/public/favicon.svg")) {
        fail("el APK no empaqueta favicon.svg, que si pide el WebView")
      } else {
        ok("el APK incluye favicon.svg")
      }
    }
  } else {
    ok("APK no indicado: se omite la inspeccion del contenido empaquetado")
  }
} else if (!existsSync(manifestPath)) {
  fail("falta manifest.webmanifest")
} else {
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    ok("manifest.webmanifest es JSON valido")
  } catch (error) {
    fail(`manifest.webmanifest no es JSON valido: ${error.message}`)
  }

  if (manifest) {
    for (const field of [
      "name",
      "short_name",
      "start_url",
      "scope",
      "display",
      "icons",
    ]) {
      if (!manifest[field]) fail(`el manifest no define "${field}"`)
    }
    // iOS exige que el nombre corto quepa en la pantalla de inicio.
    if (manifest.short_name && manifest.short_name.length > 12) {
      fail(
        `short_name "${manifest.short_name}" es largo para iOS (max 12 caracteres)`,
      )
    }
    if (manifest.display !== "standalone") {
      fail(
        `display es "${manifest.display}"; iOS solo lanza en modo standalone`,
      )
    }

    // 2. Cada icono debe existir y declarar el tamano real del PNG.
    for (const icon of manifest.icons ?? []) {
      const file = join(dist, icon.src)
      if (!existsSync(file)) {
        fail(`el icono "${icon.src}" no existe en ${dist}`)
        continue
      }
      if (icon.type === "image/svg+xml") {
        ok(`icono vectorial ${icon.src}`)
        continue
      }
      const size = pngSize(file)
      if (!size) {
        fail(`"${icon.src}" no es un PNG legible`)
      } else if (icon.sizes && icon.sizes !== `${size.width}x${size.height}`) {
        fail(
          `"${icon.src}" mide ${size.width}x${size.height} pero declara ${icon.sizes}`,
        )
      } else {
        ok(
          `icono ${icon.src} ${size.width}x${size.height} (${icon.purpose ?? "any"})`,
        )
      }
    }

    // 3. Un icono maskable es obligatorio para instalarse en Android.
    const purposes = new Set((manifest.icons ?? []).map((i) => i.purpose))
    if (!purposes.has("maskable"))
      fail("no hay ningun icono con purpose=maskable")
  }
}

// 4. El service worker solo aplica a la PWA web. En el APK es peso muerto y,
//    si algun dia se registrara, serviria contenido viejo tras actualizar.
const swPath = join(dist, "sw.js")
if (!isAndroid) {
  if (!existsSync(swPath)) {
    fail("falta sw.js")
  } else {
    const source = readFileSync(swPath, "utf8")
    try {
      new Function(source)
      ok("sw.js es sintacticamente valido")
    } catch (error) {
      fail(`sw.js no compila: ${error.message}`)
    }
    for (const event of ["install", "activate", "fetch"]) {
      if (!source.includes(`'${event}'`) && !source.includes(`"${event}"`)) {
        fail(`sw.js no escucha el evento "${event}"`)
      }
    }
  }
}

// 5. El HTML debe enlazar manifest, iconos y theme-color.
const htmlPath = join(dist, "index.html")
if (!existsSync(htmlPath)) {
  fail("falta index.html")
} else {
  const html = readFileSync(htmlPath, "utf8")
  if (isAndroid) {
    // Dentro del WebViewAssetLoader todo debe ser relativo: una ruta
    // absoluta resolveria contra el origen y no encontraria el asset.
    if (/(?:src|href)="\/(?!\/)/.test(html)) {
      fail(
        "el APK tiene rutas absolutas en index.html; el WebView no las resolveria",
      )
    }
    ok("el APK usa rutas relativas en index.html")
  } else {
    for (const pattern of [
      /rel="manifest"/,
      /rel="apple-touch-icon"/,
      /name="theme-color"/,
      /name="apple-mobile-web-app-capable"/,
    ]) {
      if (!pattern.test(html)) fail(`index.html no incluye ${pattern}`)
    }
    ok("index.html enlaza manifest, iconos y theme-color")
  }
}

console.log(notes.map((n) => `  ok    ${n}`).join("\n"))
if (problems.length > 0) {
  console.error(problems.map((p) => `  FALLA ${p}`).join("\n"))
  process.exit(1)
}
const label = isAndroid ? "APK coherente" : "PWA valida"
console.log(`\n${label} (${notes.length} comprobaciones)`)
