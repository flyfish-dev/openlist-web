import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useColorMode } from "@hope-ui/solid"
import type { ViewerController } from "@file-viewer/web"
import { useLink } from "~/hooks"
import { objStore } from "~/store"
import { fileViewerPolicy, sameOriginFileUrl } from "~/flyfish/preview-policy"

export default function FlyfishPreview() {
  const { currentObjLink, proxyLink } = useLink()
  const { colorMode } = useColorMode()
  const [error, setError] = createSignal("")
  const [loading, setLoading] = createSignal(true)
  let host!: HTMLDivElement
  let viewer: ViewerController | undefined
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
    const current = ++generation
    viewer?.destroy()
    viewer = undefined
    setError("")
    setLoading(true)
    import("~/flyfish/viewer-runtime")
      .then(({ mountFlyfishViewer }) => {
        if (current !== generation) return
        viewer = mountFlyfishViewer(host, {
          url: sameOriginFileUrl(url.href, location.origin),
          filename: name,
          size: objStore.obj.size,
          options: { theme },
          onStateChange: (state) => {
            if (current !== generation) return
            setLoading(state.loading)
            if (state.error)
              setError(
                "此文件超出当前引擎的能力边界，请切换原生预览或下载原文件。",
              )
          },
        })
      })
      .catch(() => {
        if (current !== generation) return
        setLoading(false)
        setError("预览引擎加载失败，可切换原生预览或下载原文件。")
      })
  })
  onCleanup(() => {
    generation++
    viewer?.destroy()
  })

  const definition = () => fileViewerPolicy(objStore.obj.name).definition
  return (
    <section class="flyfish-preview" aria-label="Flyfish File Viewer">
      <div class="flyfish-preview-meta">
        <span>
          FILE VIEWER <b>本地预览</b>
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
          正在按需加载预览引擎…
        </p>
      </Show>
      <Show when={error()}>
        <p class="flyfish-preview-error" role="alert">
          {error()}
        </p>
      </Show>
      <div ref={host} class="flyfish-viewer-host" />
    </section>
  )
}
