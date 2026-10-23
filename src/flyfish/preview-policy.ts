import catalog from "./catalog.generated.json"

export const NATIVE_FIRST = new Set(catalog.nativeFirstRendererIds)

const definitions = new Map(
  catalog.definitions.flatMap((definition) =>
    definition.extensions.map((extension) => [extension, definition] as const),
  ),
)

export function fileViewerPolicy(name: string, archivesAllowed = true) {
  const extension = name.toLowerCase().split(".").pop() ?? ""
  const definition =
    catalog.definitions.find((row) =>
      row.filenamePatterns.some((pattern) =>
        new RegExp(
          "^" +
            pattern
              .split("*")
              .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*") +
            "$",
          "i",
        ).test(name),
      ),
    ) ?? definitions.get(extension)
  if (!definition || (definition.id === "archive" && !archivesAllowed)) {
    return { available: false, preferred: false, definition: undefined }
  }
  return {
    available: true,
    preferred: !NATIVE_FIRST.has(definition.id),
    definition,
  }
}

export function sameOriginFileUrl(value: string, origin: string) {
  const url = new URL(value, origin)
  if (
    url.origin !== new URL(origin).origin ||
    !["http:", "https:"].includes(url.protocol)
  ) {
    throw new Error(
      "File Viewer only accepts this OpenList server's authorized file URLs",
    )
  }
  if (!/^\/(?:d|p|sd|ae)\//.test(url.pathname)) {
    throw new Error(
      "File Viewer requires an OpenList download or archive endpoint",
    )
  }
  return url.href
}
