import { mkdir, writeFile } from "node:fs/promises"
import { DEFAULT_RENDERER_DEFINITIONS } from "@file-viewer/core"
import { ifcRendererDefinition } from "@file-viewer/renderer-3d/ifc"
import { geo3dRendererDefinition } from "@file-viewer/renderer-3d/geo3d"
import routing from "../../src/flyfish/routing.json" with { type: "json" }

const definitions = [...DEFAULT_RENDERER_DEFINITIONS, ifcRendererDefinition, geo3dRendererDefinition].map((definition) => ({
  id: definition.id,
  label: definition.label,
  category: definition.category,
  extensions: [...definition.extensions, ...(definition.enhancesExtensions ?? [])],
  filenamePatterns: definition.filenamePatterns ?? [],
  sourceAccess: definition.sourceAccess ?? 'buffer',
  status: definition.status,
  supportLevel: definition.supportLevel,
  packageName: definition.packageName,
  knownLimits: definition.knownLimits ?? [],
}))
const catalog = {
  version: "3.2.2",
  canonicalExtensions: new Set(DEFAULT_RENDERER_DEFINITIONS.flatMap((definition) => definition.extensions)).size,
  canonicalPipelines: DEFAULT_RENDERER_DEFINITIONS.length,
  nativeFirstRendererIds: routing.nativeFirstRendererIds,
  preferredExtensions: [
    ...new Set(
      definitions
        .filter((row) => !routing.nativeFirstRendererIds.includes(row.id))
        .flatMap((row) => row.extensions),
    ),
  ].sort(),
  extensions: [...new Set(definitions.flatMap((row) => row.extensions))].sort(),
  definitions,
}
await mkdir("src/flyfish", { recursive: true })
await mkdir("public/flyfish", { recursive: true })
const json = JSON.stringify(catalog, null, 2) + "\n"
await writeFile("src/flyfish/catalog.generated.json", json)
await writeFile("public/flyfish/format-catalog.json", json)
console.log(
  `File Viewer ${catalog.version}: ${catalog.extensions.length} extensions, ${definitions.length} pipelines`,
)
