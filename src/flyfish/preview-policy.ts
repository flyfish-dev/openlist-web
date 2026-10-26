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

const RESIDENT_DOCUMENTS = new Set([
  "office-word-openxml",
  "office-word-binary",
  "office-presentation-binary",
  "office-presentation",
  "open-document",
  "spreadsheet-openxml",
  "apple-pages",
  "apple-numbers",
  "apple-keynote",
  "office-wordperfect",
  "spreadsheet-dbf",
  "pdf",
  "ofd",
  "office-hangul",
  "email",
  "chm",
  "epub",
  "ebook-fb2",
  "umd",
  "signature",
  "markdown",
  "code",
])

export function residentPreviewPolicy(
  filename: string,
  size: number | undefined,
  revision: string,
) {
  const definition = fileViewerPolicy(filename).definition
  const bytes = Number.isFinite(size) && size! > 0 ? size! : 0
  return {
    retain:
      !!revision &&
      bytes > 0 &&
      bytes <= 8 * 1024 * 1024 &&
      !!definition &&
      RESIDENT_DOCUMENTS.has(definition.id),
    estimatedBytes: 2 * 1024 * 1024 + bytes * 8,
  }
}
