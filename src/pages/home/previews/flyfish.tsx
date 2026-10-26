import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useColorMode } from "@hope-ui/solid"
import type { ResidentLease } from "~/flyfish/resident-viewer"
import { useLink } from "~/hooks"
import { objStore } from "~/store"
import { fileViewerPolicy, sameOriginFileUrl } from "~/flyfish/preview-policy"
import {
  acquireResidentPreview,
  residentPreviewStatistics,
} from "~/flyfish/preview-session"
import { previewAuthorizationScope } from "~/flyfish/PreviewSessions"

export default function FlyfishPreview() {
  const { currentObjLink, proxyLink } = useLink()
  const { colorMode } = useColorMode()
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  const [cacheHit, setCacheHit] = createSignal(false)
  let host!: HTMLDivElement
  let section!: HTMLElement
  let lease: ResidentLease | undefined
  let generation = 0

  createEffect(() => {
    const name = objStore.obj.name
    // Enhanced formats use OpenList's authenticated proxy, not a cross-origin
    // cloud redirect. Existing native previews keep their original link policy.
    const enhanced = fileViewerPolicy(name).preferred
    const url = new URL(
      enhanced ? proxyLink(objStore.obj) : currentObjLink(),
      location.origin,
    )
    if (enhanced) url.searchParams.set("d", "1")
    const theme = colorMode()
    const size = objStore.obj.size
    const revision = objStore.obj.modified
    const scope = previewAuthorizationScope()
    const current = ++generation
    lease?.release()
    lease = undefined
    const abort = new AbortController()
    setError("")
    setLoading(true)
    delete section.dataset.flyfishReadyMs
    setCacheHit(false)
    void acquireResidentPreview(
      host,
      {
        source: {
          url: sameOriginFileUrl(url.href, location.origin),
          filename: name,
          size,
          options: { theme },
        },
        revision,
        scope,
      },
      ({ state, instance, cacheHit, readyMs }) => {
        if (current !== generation) return
        setLoading(state.loading)
        setCacheHit(cacheHit)
        setError(
          state.error
            ? "此文件超出当前引擎的能力边界，请切换原生预览或下载原文件。"
            : "",
        )
        section.dataset.flyfishInstance = String(instance)
        section.dataset.flyfishCacheHit = String(cacheHit)
        if (readyMs !== null)
          section.dataset.flyfishReadyMs = readyMs.toFixed(1)
        const stats = residentPreviewStatistics()
        if (stats) section.dataset.flyfishSessions = String(stats.resident)
      },
      abort.signal,
    )
      .then((result) => {
        if (current !== generation || abort.signal.aborted) result?.release()
        else lease = result
      })
      .catch(() => {
        if (current !== generation) return
        setLoading(false)
        setError("预览引擎加载失败，可切换原生预览或下载原文件。")
      })
    onCleanup(() => {
      abort.abort()
      generation++
      lease?.release()
      lease = undefined
    })
  })

  const definition = () => fileViewerPolicy(objStore.obj.name).definition
  return (
    <section
      ref={section}
      class="flyfish-preview"
      aria-label="Flyfish File Viewer"
      aria-busy={loading()}
    >
      <div class="flyfish-preview-meta">
        <span>
          FILE VIEWER{" "}
          <b>{cacheHit() && !loading() ? "会话已复用" : "本地预览"}</b>
        </span>
        <span>
          {definition()?.supportLevel} ·{" "}
          {definition()?.status === "experimental" ? "实验性支持" : "稳定支持"}
        </span>
      </div>
      <Show when={definition()?.status === "experimental"}>
        <p class="flyfish-preview-notice">
          此格式为实验性预览，不代表完整保真。
          {definition()?.knownLimits.join("；")}
        </p>
      </Show>
      <Show when={loading()}>
        <p class="flyfish-preview-loading" role="status">
          正在打开文件…
        </p>
      </Show>
      <Show when={error()}>
        <p class="flyfish-preview-error" role="alert">
          {error()}
        </p>
      </Show>
      <div
        ref={host}
        class="flyfish-viewer-host"
        style={{ visibility: loading() || error() ? "hidden" : undefined }}
      />
    </section>
  )
}
