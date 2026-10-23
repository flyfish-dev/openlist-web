import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const policySource = await readFile(
  new URL("../../src/flyfish/preview-policy.ts", import.meta.url),
  "utf8",
)
const catalog = JSON.parse(
  await readFile(
    new URL("../../src/flyfish/catalog.generated.json", import.meta.url),
  ),
)
// Keep the pure routing logic executable with the project's supported Node runtime.
const { stripTypeScriptTypes } = await import("node:module")
const source = stripTypeScriptTypes(policySource, { mode: "strip" }).replace(
  'import catalog from "./catalog.generated.json"',
  `const catalog = ${JSON.stringify(catalog)}`,
)
const policy = await import(
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
)

test("every canonical extension has a route with an honest support status", () => {
  assert.equal(catalog.canonicalExtensions, 275)
  assert.equal(catalog.canonicalPipelines, 47)
  assert.equal(catalog.extensions.length, 283)
  assert.equal(catalog.definitions.length, 49)
  for (const name of catalog.extensions) {
    const result = policy.fileViewerPolicy("sample." + name)
    assert.equal(result.available, true, name)
    assert.ok(
      ["stable", "experimental"].includes(result.definition.status),
      name,
    )
  }
})

test('optional BIM and streaming metadata are routed without stealing ordinary images or JSON', () => {
  for (const name of ['building.ifc', 'terrain.laz', 'terrain.copc.laz', 'tileset.json', 'map.city.json']) {
    const result = policy.fileViewerPolicy(name)
    assert.equal(result.preferred, true, name)
    assert.equal(result.definition.status, 'experimental', name)
  }
  assert.equal(policy.fileViewerPolicy('ordinary.json').preferred, false)
  assert.equal(policy.fileViewerPolicy('ordinary.tiff').preferred, false)
})

test("native image, media, PDF and text remain the first preview", () => {
  for (const name of [
    "photo.jpg",
    "film.mp4",
    "sound.mp3",
    "paper.pdf",
    "readme.md",
    "script.js",
    "archive.zip",
  ]) {
    assert.equal(policy.fileViewerPolicy(name).preferred, false, name)
  }
})

test("enhanced document and specialist formats prefer File Viewer", () => {
  for (const name of [
    "report.docx",
    "sheet.xlsx",
    "deck.ppt",
    "layout.ofd",
    "drawing.dwg",
    "study.dcm",
    "image.psd",
  ]) {
    assert.equal(policy.fileViewerPolicy(name).preferred, true, name)
  }
})

test("the alternate renderer cannot bypass archive-read permissions", () => {
  assert.equal(policy.fileViewerPolicy("private.zip", false).available, false)
})

test("unknown formats and hostile file URLs do not become a fetch proxy", () => {
  assert.equal(policy.fileViewerPolicy("unknown.unsupported").available, false)
  for (const value of [
    "https://evil.test/d/a.docx",
    "javascript:alert(1)",
    "/api/admin/setting/list",
    "//evil.test/p/a.docx",
  ]) {
    assert.throws(() =>
      policy.sameOriginFileUrl(value, "https://drive.example.test"),
    )
  }
  assert.equal(
    policy.sameOriginFileUrl(
      "/sd/share/file.docx?pwd=private",
      "https://drive.example.test",
    ),
    "https://drive.example.test/sd/share/file.docx?pwd=private",
  )
})
