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

export function mountFlyfishViewer(
  element: HTMLElement,
  source: ViewerMountOptions,
) {
  const assetBase = `/file-viewer/${catalog.version}/`
  setDefaultFileViewerAssetBaseUrl(assetBase)
  // URL-first specialists own their range probes. An empty buffer avoids the
  // generic Web controller eagerly downloading an entire COPC/COG dataset.
  const input =
    source.url &&
    fileViewerPolicy(source.filename ?? source.name ?? "").definition
      ?.sourceAccess === "stream-preferred"
      ? { ...source, buffer: new ArrayBuffer(0) }
      : source
  return mountViewer(element, {
    ...input,
    options: {
      ...createFullAssetOptions(assetBase),
      preset: allRenderers,
      rendererMode: "extend",
      renderers: [
        webRenderer(designRenderer),
        webRenderer(dicomRenderer),
        webRenderer(signatureRenderer),
        webRenderer(binaryRenderer),
        webRenderer(
          createIfcRenderer({ assetBaseUrl: `${assetBase}vendor/ifc/` }),
        ),
        webRenderer(
          createGeo3dRenderer({ assetBaseUrl: `${assetBase}vendor/geo3d/` }),
        ),
      ],
      locale: "zh-CN",
      toolbar: true,
      styleIsolation: "shadow",
      ...source.options,
    },
  })
}
