import { createMemo, createSignal, For, Show } from "solid-js"
import { useRouter } from "~/hooks"
import { objStore, State } from "~/store"
import catalog from "./catalog.generated.json"
import brandLogo from "./logo.png"
import { LinkWithBase } from "~/components/LinkWithBase"

export function BrandMark() {
  return (
    <LinkWithBase
      class="flyfish-brand"
      href="/"
      aria-label="Flyfish Drive 首页"
    >
      <img src={brandLogo} alt="Flyfish" width="38" height="38" />
      <span>
        <strong>
          Flyfish<span>Drive</span>
        </strong>
        <small>自由连接 · 安全共享</small>
      </span>
    </LinkWithBase>
  )
}

export function BrandHero() {
  const { pathname, isShare } = useRouter()
  return (
    <Show
      when={pathname() === "/" && !isShare() && objStore.state === State.Folder}
    >
      <section class="flyfish-hero">
        <div class="flyfish-hero-copy">
          <p class="flyfish-eyebrow">
            <i /> THE FLYFISH RESOURCE SPACE
          </p>
          <h1>
            让好资源，
            <br />
            <em>自由流动。</em>
          </h1>
          <p class="flyfish-intro">
            连接文件、灵感与协作。
            <br />
            在熟悉的云盘里，发现更轻盈的阅读方式。
          </p>
          <div class="flyfish-hero-actions">
            <a href="#flyfish-files">
              浏览资源 <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://o.flyfish.dev/"
              target="_blank"
              rel="noopener noreferrer"
            >
              协作知识库 <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        <div class="flyfish-orbit" aria-hidden="true">
          <div class="flyfish-orbit-ring" />
          <div class="flyfish-orbit-ring second" />
          <img src={brandLogo} width="148" height="148" alt="" />
          <span class="flyfish-orbit-label label-one">
            DOCUMENTS <b>文档</b>
          </span>
          <span class="flyfish-orbit-label label-two">
            DESIGN <b>设计</b>
          </span>
          <span class="flyfish-orbit-label label-three">
            IDEAS <b>灵感</b>
          </span>
          <p>ONE SPACE. MORE POSSIBILITIES.</p>
        </div>
        <div class="flyfish-principles">
          <span>
            <b>01</b> 默认私有 · 分享由你决定
          </span>
          <span>
            <b>02</b> 按需预览 · 不加载无关重型引擎
          </span>
          <span>
            <b>03</b> 开放构建 · OpenList × File Viewer
          </span>
        </div>
      </section>
    </Show>
  )
}

export function FormatMatrix() {
  let dialog!: HTMLDialogElement
  const [query, setQuery] = createSignal("")
  const rows = createMemo(() =>
    catalog.definitions.filter((row) =>
      `${row.label} ${row.extensions.join(" ")} ${row.category}`
        .toLowerCase()
        .includes(query().toLowerCase()),
    ),
  )
  return (
    <>
      <button class="flyfish-matrix-trigger" onClick={() => dialog.showModal()}>
        预览能力 <span>↗</span>
      </button>
      <dialog
        ref={dialog}
        class="flyfish-matrix"
        aria-labelledby="flyfish-matrix-title"
        onClick={(event) => {
          if (event.target === dialog) dialog.close()
        }}
      >
        <div class="flyfish-matrix-heading">
          <div>
            <p class="flyfish-eyebrow">FILE VIEWER {catalog.version}</p>
            <h2 id="flyfish-matrix-title">看得见，也说得清。</h2>
          </div>
          <button onClick={() => dialog.close()} aria-label="关闭支持矩阵">
            ×
          </button>
        </div>
        <p>
          {catalog.extensions.length} 个扩展名 · {catalog.definitions.length}{" "}
          条预览管线。支持级别按具体格式区分；实验性不等于完整保真。
        </p>
        <p class="flyfish-matrix-note">
          图片、音视频、PDF、文本和压缩包优先沿用 OpenList
          原生预览；Office、CAD、OFD、设计等增强格式优先使用 File
          Viewer。所有原生预览选项仍保留。宏与可执行文件不会执行。
        </p>
        <input
          type="search"
          aria-label="搜索文件格式"
          placeholder="搜索格式，例如 docx、dwg、psd…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <div class="flyfish-matrix-scroll">
          <table>
            <thead>
              <tr>
                <th>预览管线</th>
                <th>格式</th>
                <th>级别与边界</th>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr>
                    <td>
                      <strong>{row.label}</strong>
                      <small>{row.packageName}</small>
                    </td>
                    <td>{row.extensions.join(" · ")}</td>
                    <td>
                      <span
                        classList={{
                          "flyfish-experimental": row.status === "experimental",
                        }}
                      >
                        {row.status === "stable" ? "稳定" : "实验性"} ·{" "}
                        {row.supportLevel}
                      </span>
                      <small>
                        {row.knownLimits.join("；") ||
                          "以具体文件和字体环境为准"}
                      </small>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <div class="flyfish-matrix-footer">
          <a href="/flyfish/format-catalog.json" download="format-catalog.json">
            下载完整机器可读矩阵
          </a>
          <a
            href="https://doc.file-viewer.app/guide/formats"
            target="_blank"
            rel="noopener noreferrer"
          >
            查看格式边界 ↗
          </a>
        </div>
      </dialog>
    </>
  )
}
