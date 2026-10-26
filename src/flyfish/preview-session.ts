import type { ViewerMountOptions } from "@file-viewer/web"
import type {
  ResidentLease,
  ResidentRequest,
  ResidentSnapshot,
  ResidentViewerPool,
} from "./resident-viewer"

type Runtime = typeof import("./viewer-runtime")
let runtime: Promise<Runtime> | undefined
let pool: ResidentViewerPool<HTMLElement> | undefined
let identity: string | undefined
let epoch = 0

function getRuntime() {
  runtime ??= import("./viewer-runtime").catch((error: unknown) => {
    runtime = undefined
    throw error
  })
  return runtime
}

export function clearResidentPreviews() {
  epoch++
  pool?.clear()
  pool = undefined
}

export function setPreviewIdentity(value: string) {
  if (identity !== value) {
    clearResidentPreviews()
    identity = value
  }
}

export async function warmResidentPreviews(filename?: string) {
  const version = epoch
  const module = await getRuntime()
  if (version !== epoch) return
  pool ??= module.createResidentPool()
  pool.warm()
  if (filename) module.prefetchPreviewAssets(filename)
}

export async function acquireResidentPreview(
  host: HTMLElement,
  input: { source: ViewerMountOptions; revision: string; scope: string },
  listener: (snapshot: ResidentSnapshot) => void,
  signal: AbortSignal,
): Promise<ResidentLease | undefined> {
  setPreviewIdentity(input.scope)
  const version = epoch
  const module = await getRuntime()
  if (signal.aborted || version !== epoch) return
  pool ??= module.createResidentPool()
  const request: ResidentRequest = {
    key: JSON.stringify([
      input.source.url,
      input.source.filename,
      input.source.size,
      input.revision,
    ]),
    scope: input.scope,
    source: input.source,
    ...module.residentPolicy(
      input.source.filename ?? input.source.name ?? "",
      input.source.size,
      input.revision,
    ),
  }
  return pool.acquire(host, request, listener)
}

export function sweepResidentPreviews() {
  pool?.sweep()
  pool?.warm()
}

export function residentPreviewStatistics() {
  return pool?.statistics()
}
