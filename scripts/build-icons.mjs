// Renders every app icon from public/icon.svg with headless Chromium (Playwright):
//   public/apple-icon.png (180, full-bleed) and public/favicon.ico (16/32/48).
// Same script as in checkin, regnskap, sales, forening, forms and events.
//
// Playwright is not a dependency here: set PLAYWRIGHT_MODULE to a sibling repo's
// node_modules/playwright/index.mjs. CHROMIUM_PATH overrides the browser binary
// (default: newest ~/.cache/ms-playwright headless shell).
import { globSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const source = join(root, "public/icon.svg")
const svg = readFileSync(source, "utf8")

async function loadChromium() {
  try {
    return (await import("playwright")).chromium
  } catch {
    const mod = process.env.PLAYWRIGHT_MODULE
    if (!mod)
      throw new Error(
        "Playwright not found. Set PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs",
      )
    return (await import(mod)).chromium
  }
}

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const pattern = join(
    homedir(),
    ".cache/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell",
  )
  return globSync(pattern).sort().at(-1)
}

/** PNG-in-ICO container (Vista+ format; every modern browser reads it). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  let offset = header.length
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(size >= 256 ? 0 : size, e)
    header.writeUInt8(size >= 256 ? 0 : size, e + 1)
    header.writeUInt8(0, e + 2) // palette
    header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4) // planes
    header.writeUInt16LE(32, e + 6) // bpp
    header.writeUInt32LE(data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...pngs.map((p) => p.data)])
}

const chromium = await loadChromium()
const browser = await chromium.launch({ executablePath: chromiumPath() })
const page = await browser.newPage()

async function render(markup, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block}</style><img src="${src}" width="${size}" height="${size}">`,
  )
  await page.locator("img").evaluate((img) => img.decode())
  return page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
}

// iOS masks the apple-icon itself, so give it a square background.
const fullBleed = svg.replace('rx="205"', 'rx="0"')

writeFileSync(join(root, "public/apple-icon.png"), await render(fullBleed, 180))
const favicon = []
for (const size of [16, 32, 48])
  favicon.push({ size, data: await render(svg, size) })
writeFileSync(join(root, "public/favicon.ico"), ico(favicon))

await browser.close()
console.log("Icons written from public/icon.svg")
