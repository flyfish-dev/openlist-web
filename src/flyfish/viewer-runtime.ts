import { mountViewer, type ViewerMountOptions } from "@file-viewer/web"
import allRenderers, { createFullAssetOptions } from "@file-viewer/preset-all"
import designRenderer from "@file-viewer/renderer-design"
import dicomRenderer from "@file-viewer/renderer-dicom"
import signatureRenderer from "@file-viewer/renderer-signature"
import binaryRenderer from "@file-viewer/renderer-binary"
import { createIfcRenderer } from "@file-viewer/renderer-3d/ifc"
import { createGeo3dRenderer } from "@file-viewer/renderer-3d/geo3d"
import { setDefaultFileViewerAssetBaseUrl } from "@file-viewer/core/assets"
import type {
  FileRenderHandler,
  FileViewerRendererPlugin,
} from "@file-viewer/core"
import { fileViewerPolicy } from "./preview-policy"
import catalog from "./catalog.generated.json"
import { ResidentViewerPool } from "./resident-viewer"
import type { ResidentSurface } from "./resident-viewer"
export { residentPreviewPolicy as residentPolicy } from "./preview-policy"

function webRenderer<Result>(
  plugin: FileViewerRendererPlugin<FileRenderHandler<Result, HTMLDivElement>>,
): FileViewerRendererPlugin {
  if (plugin.install)
    throw new Error(
      "A renderer with an install hook needs an explicit web adapter",
    )
  return {
    id: plugin.id,
    label: plugin.label,
    definitions: plugin.definitions,
    assets: plugin.assets,
    handlers: plugin.handlers?.map((entry) => ({
      ...entry,
      handler: (buffer, target, type, context) => {
        if (!(target instanceof HTMLDivElement))
          throw new Error("A DIV preview surface is required")
        return entry.handler(buffer, target, type, context)
      },
    })),
  }
}

const assetBase = `/file-viewer/${catalog.version}/`
setDefaultFileViewerAssetBaseUrl(assetBase)
const assetOptions = createFullAssetOptions(assetBase)
const options = {
  ...assetOptions,
  preset: allRenderers,
  rendererMode: "extend" as const,
  renderers: [
    webRenderer(designRenderer),
    webRenderer(dicomRenderer),
    webRenderer(signatureRenderer),
    webRenderer(binaryRenderer),
    webRenderer(createIfcRenderer({ assetBaseUrl: `${assetBase}vendor/ifc/` })),
    webRenderer(
      createGeo3dRenderer({ assetBaseUrl: `${assetBase}vendor/geo3d/` }),
    ),
  ],
  locale: "zh-CN" as const,
  toolbar: true,
  styleIsolation: "shadow" as const,
}

export function viewerInput(source: ViewerMountOptions): ViewerMountOptions {
  // URL-first specialists own their range probes. An empty buffer avoids the
  // generic Web controller eagerly downloading an entire COPC/COG dataset.
  const stream =
    source.url &&
    fileViewerPolicy(source.filename ?? source.name ?? "").definition
      ?.sourceAccess === "stream-preferred"
  return {
    // Explicitly clear previous source fields when the same controller changes format.
    url: undefined,
    file: undefined,
    buffer: undefined,
    name: undefined,
    filename: undefined,
    type: undefined,
    size: undefined,
    ...source,
    ...(stream ? { buffer: new ArrayBuffer(0) } : {}),
    options: { ...options, ...source.options },
  }
}

function createSurface(): ResidentSurface<HTMLElement> {
  const parked = document.createElement("div")
  parked.setAttribute("aria-hidden", "true")
  parked.inert = true
  parked.style.cssText =
    "position:fixed;left:-100000px;top:0;width:1280px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;contain:layout style paint"
  const host = document.createElement("div")
  host.className = "flyfish-resident-surface"
  host.style.width = "100%"
  parked.append(host)
  document.body.append(parked)
  const controller = mountViewer(host, viewerInput({}))
  const api = controller.getApi()
  if (api && "prepare" in api) void api.prepare?.().catch(() => {})
  return {
    attach(target) {
      host.style.width = "100%"
      target.replaceChildren(host)
    },
    park() {
      const width = host.getBoundingClientRect().width
      if (width > 0) host.style.width = `${width}px`
      parked.append(host)
    },
    update: (source) => controller.update(viewerInput(source)),
    state: () => controller.getState(),
    subscribe: (listener) => controller.subscribe(listener),
    estimateBytes(source) {
      const root = host.shadowRoot ?? host
      let bytes =
        2 * 1024 * 1024 +
        (source.size ?? 0) * 8 +
        root.querySelectorAll("*").length * 512
      for (const canvas of root.querySelectorAll("canvas"))
        bytes += canvas.width * canvas.height * 4
      for (const image of root.querySelectorAll("img"))
        bytes += image.naturalWidth * image.naturalHeight * 4
      return bytes
    },
    destroy() {
      controller.destroy()
      host.remove()
      parked.remove()
    },
  }
}

export function createResidentPool() {
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory
  return new ResidentViewerPool(createSurface, {
    now: () => performance.now(),
    limits:
      memory && memory <= 2
        ? { entries: 2, bytes: 24 * 1024 * 1024 }
        : undefined,
  })
}

const prefetched = new Set<string>()
export function prefetchPreviewAssets(filename: string) {
  const id = fileViewerPolicy(filename).definition?.id
  const urls =
    id === "office-word-openxml"
      ? [assetOptions.docx?.workerUrl, assetOptions.docx?.workerJsZipUrl]
      : id === "office-presentation"
        ? [assetOptions.presentation?.workerUrl]
        : id?.startsWith("spreadsheet-")
          ? [assetOptions.spreadsheet?.workerUrl]
          : []
  for (const item of urls) {
    if (!item) continue
    const value = String(item)
    if (prefetched.has(value)) continue
    const url = new URL(value, location.origin)
    if (url.origin !== location.origin || !url.pathname.startsWith(assetBase))
      continue
    prefetched.add(value)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    void fetch(url, {
      cache: "force-cache",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("javascript")
        )
          throw new Error("Preview asset is not available")
        return response.arrayBuffer()
      })
      .catch(() => prefetched.delete(value))
      .finally(() => clearTimeout(timeout))
  }
}
