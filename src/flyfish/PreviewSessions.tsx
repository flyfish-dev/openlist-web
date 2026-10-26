import { createEffect, onCleanup, onMount } from "solid-js"
import { me, objStore, password, State } from "~/store"
import { fileViewerPolicy } from "./preview-policy"
import {
  clearResidentPreviews,
  setPreviewIdentity,
  sweepResidentPreviews,
  warmResidentPreviews,
} from "./preview-session"

export function previewAuthorizationScope() {
  const user = me()
  return JSON.stringify([
    localStorage.getItem("token"),
    user.id,
    user.role,
    user.base_path,
    user.permission,
    user.disabled,
    password(),
  ])
}

export function PreviewSessions() {
  createEffect(() => setPreviewIdentity(previewAuthorizationScope()))
  createEffect(() => {
    if (objStore.err || objStore.state === State.NeedPassword)
      clearResidentPreviews()
  })
  onMount(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string }
      }
    ).connection
    const eager =
      !connection?.saveData && !connection?.effectiveType?.includes("2g")
    const warm = () => {
      void warmResidentPreviews().catch(() => {})
    }
    const idle =
      eager && "requestIdleCallback" in window
        ? window.requestIdleCallback(warm, { timeout: 2500 })
        : undefined
    const fallback =
      eager && idle === undefined ? window.setTimeout(warm, 1200) : undefined
    const intent = (event: Event) => {
      if (!eager || !(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>("a[href]")
      if (!link || link.origin !== location.origin) return
      let name: string
      try {
        name = decodeURIComponent(link.pathname.split("/").pop() ?? "")
      } catch {
        return
      }
      if (fileViewerPolicy(name).preferred)
        void warmResidentPreviews(name).catch(() => {})
    }
    const changed = (event: StorageEvent) => {
      if (event.key === null || event.key === "token") clearResidentPreviews()
    }
    const hide = () => clearResidentPreviews()
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload()
    }
    const timer = window.setInterval(sweepResidentPreviews, 60_000)
    document.addEventListener("pointerover", intent, { passive: true })
    document.addEventListener("focusin", intent)
    window.addEventListener("storage", changed)
    window.addEventListener("pagehide", hide)
    window.addEventListener("pageshow", restore)
    onCleanup(() => {
      if (idle !== undefined) window.cancelIdleCallback(idle)
      if (fallback !== undefined) window.clearTimeout(fallback)
      window.clearInterval(timer)
      document.removeEventListener("pointerover", intent)
      document.removeEventListener("focusin", intent)
      window.removeEventListener("storage", changed)
      window.removeEventListener("pagehide", hide)
      window.removeEventListener("pageshow", restore)
      clearResidentPreviews()
    })
  })
  return null
}
