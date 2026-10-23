# Flyfish Drive

A branded OpenList 4.2.7 frontend with browser-local File Viewer 3.2.2. Backend
requests, login, share authorization, storage adapters and native previews stay
with OpenList. This fork does not contain a production database or credentials.

## Build

Use Node.js 24 and the package-manager version pinned in `package.json`:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm test:flyfish
NODE_OPTIONS=--max-old-space-size=8192 corepack pnpm build
```

The prebuild step derives the public support matrix from the installed renderer
definitions and copies version-matched workers, WASM, fonts and vendor assets.
These assets live below `/file-viewer/3.2.2/`, so stale CDN fallback pages or a
future engine upgrade cannot silently reuse an incompatible Worker URL.
Generated engine assets are deliberately excluded from Git. Deploy **all** of
`dist`, not just JavaScript files. The current deployment contract is a root-path
installation behind HTTPS; a separate cross-origin asset CDN is not supported.
The complete optional-engine/legacy build needs an adequately sized build host;
the 8 GiB Node heap allowance is not a server runtime memory requirement.

## Preview Routing

`src/flyfish/routing.json` is the native-first policy. Images, audio, video, PDF,
text/code/Markdown and archives keep their existing OpenList preview first.
Office and specialist formats prefer File Viewer; original preview choices and
downloads remain available. The runtime bundle is lazy-loaded on selection.
URL-first Geo3D adapters keep the original authorized URL and perform their own
bounded range probes instead of an eager whole-file Web-component download.
External sidecar resources still need valid OpenList authorization; prefer
self-contained GLB/3TZ or packaged resources when sharing multi-file models.

`/flyfish/format-catalog.json` includes the canonical 275 extensions and 47 pipelines,
plus explicit IFC/streaming Geo3D adapters (283 unique extensions, 49 definitions), including
each renderer's status, support level and known limitations. This is a routing
and capability declaration, **not a claim that every possible document has been
visually validated**. Experimental formats are visibly marked. File complexity,
memory, fonts, browser WebGL/WebGPU support, encryption and codecs can still
limit fidelity. Macros and executables are not executed.

Enhanced formats use OpenList's signed same-origin `/p/` or authorized `/sd/`
endpoint. Add `preferredExtensions` from the generated catalog to OpenList's
`proxy_types` setting. Never make an arbitrary URL proxy or send private files
to third-party online-office services. Archive-read and share-preview permission
checks are retained. Nested archive documents use the archive engine's own
viewer rather than a mismatched root-file URL.

## Deployment And Licenses

Mount `dist` read-only at `/opt/openlist/web` and set backend `dist_dir` to that
path. See the paired [backend fork](https://github.com/flyfish-dev/openlist/tree/flyfish/tools/flyfish)
for migration and Compose examples. Keep backend dynamic configuration injection
enabled; do not replace it with an unrelated static-SPA fallback.

OpenList frontend remains MIT licensed. The paired server is AGPL-3.0. File
Viewer packages retain their original licenses and attribution. In particular,
the binary PPT adapter's separately licensed visible watermark is not removed.
Manrope font license and distributed third-party notices remain in their assets.
The Flyfish mark is project branding, not a grant to impersonate the deployment.

The footer links to the complete corresponding backend and frontend source.
No registration, guest-access widening, credential reset or public sharing of
existing private storage is performed by this frontend.
