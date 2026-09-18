# Implementation checkpoint — paper backgrounds and board gallery

This remains a development preview. The user manually pushed the CLI forwarding correction, supplied a successful Windows x64 Actions screenshot (including native build and artifact upload), and ran the app. The new correction below is local only and still needs a new user-pushed cloud build and physical tablet acceptance. Resume here rather than starting again.

## Latest paper-background revision (2026-09-18)

- Added desktop header Background panel: 10 paper colors and 9 styles matching the user's reference (none, dots, square, dense graph, mixed major/minor grid, diamond, wide ruled, triangle, narrow ruled). No extra help prose.
- `paperGrid` is an independent per-board persisted AppState field with validation, legacy default `none`, and undo/redo support. Does not change grid snapping, drawing style, pressure or tool selection. New boards do not inherit another board's paper.
- Shared world-anchored geometry renders canvas, SVG exports and picker previews. Paper follows pan/zoom, fades when too dense, and contrasts with light/dark backgrounds. Canvas/PNG and SVG include paper only when background export is enabled; transparent export omits it. Blank and populated gallery thumbnails include paper without writing back scene normalization.
- Fixed header API readiness rendering so Background remains available after reopening a saved board.
- Verification: 164 focused JS/React tests passed, 1 existing upstream todo; root/desktop typechecks, targeted lint, frontend production build and diff checks passed. Includes 23 new geometry/persistence/export tests, desktop save/reopen/undo/no-cross-board-leak test, and all 20 pen/eraser/straight-ink tests run with mixed paper enabled. Windows CI includes the new tests.
- Browser visual QA used mock native IPC and disposable in-memory boards: checked picker layout/selection, yellow triangular paper, black dotted paper and a blank board's gallery thumbnail. Production build uses real Tauri IPC separately. No user board files touched. No physical Huion test, native executable build, tool installation, GitHub push or workflow dispatch performed. User must manually push and download a new Windows artifact to test this revision.

## Latest gallery / recycle-bin revision (2026-09-18)

- User confirmed Shift/hold drawing is fixed, requested ordinary line-tool clean curves, replacing the board sidebar with a startup gallery and thumbnails, a top-left return button, a 10-item/10-day recycle bin, and removal of redundant helper prose.
- Ordinary new desktop lines opt into roughness 0 via `straightInk.smoothLines`. Other shapes, upstream consumers and existing drawings retain their styles; selected lines can still be manually restyled.
- Added `BoardHome` and `BoardThumbnail`: actual read-only scene/image export to bounded PNG previews; lazy, serialized thumbnail work avoids decoding the whole library at once. A broken preview does not block other boards. Editor mounts only after selecting a board. Return-home flushes document and settings first; failed save keeps the editor open. Rename/delete now operate on gallery cards.
- Removed decorative empty-state text, sidebar synchronization disclaimer and redundant form/settings prose. Retained concise errors, save state, conflict notice and deletion/retention information.
- Added Rust `trash` storage separate from legacy recovery: atomic complete copy before deletion, capacity 10 newest, expiry at 10 days, UUID/path confinement, restore without overwrite, record removal only after successful file save. Prunes on startup/list/delete/restore plus an app-owned expiry timer. No OS background job; when closed, expiry is enforced next launch. Existing auto-backups remain under Settings > 历史备份, not silently migrated or deleted.
- Device clarified by user: Huion L610, no touch; side button toggles pen/eraser (not hold). User says official web editor supports it. Do not force a driver remapping; physical desktop compatibility remains to be verified.
- Checks for this revision: 112 JS/React tests passed with 1 existing upstream todo; 11 Rust storage tests passed offline. Root and desktop typechecks, targeted lint and frontend production build passed. Browser screenshot verified gallery layout and real content thumbnails using a workspace-only mock native backend. No user files were used in preview, no native build/system installation/push performed. Native IPC integration and executable require the next user-pushed Windows cloud build.
- Test helpers: `work/preview-desktop.mjs` and `work/preview-native.mjs` outside the repo build a mock-only browser preview into `work/preview-dist`; never package this preview. Production `desktop/dist` is separately built from unmodified Tauri IPC imports.

## Latest straight-ink / tablet correction (2026-09-18)

- User reported separated/doubled curves when bending converted straight strokes, and previews stopping before the pointer while the completed line was correct. User agreed to smooth converted lines and requested tablet compatibility checks.
- Preview now replaces the temporary freedraw with an actual standard line using the same id, then updates its endpoint. This bypasses two-point freedraw streamline shortening. Converted lines use roughness 0 so RoughJS paths coincide when bent; ordinary drawing defaults and existing elements are unchanged.
- Standard converted lines preserve configured color, width and opacity, but are uniform-width and do not retain variable pressure along the line. Ordinary freehand keeps real pen pressure, including a first sample of exactly 0.5. First-pen variability matches existing pen detection behavior; an explicit later constant-width choice is respected.
- Track the active pointer id; palm touch cannot terminate a pen stroke in pen mode, and unrelated pointer move/up/cancel events cannot hijack it. Tool switches cancel pending gesture timers.
- Added 19 simulated pointer/rendering regression tests: mouse/pen preview geometry, identical final rendering, smooth bent path, pen pressure, style defaults, explicit constant-width preference, hold/negative endpoints/undo, zoom and scroll, palm input, hover, cancellation, side button, hardware eraser switching/erasure, Shift/Alt changes, curved-stroke rejection and no late conversion after release. Included this file in Windows CI.
- Local checks: 105 JS/React tests passed across 8 files, 1 existing upstream todo; includes 49 desktop/gesture tests and 56 upstream linear-editor tests. Root and desktop TypeScript checks, targeted ESLint and frontend production build passed. Rust unchanged; the previous 7 storage tests also passed in the successful cloud run.
- No physical tablet is available to the agent. Device-specific drivers, pressure reporting, Windows Ink, touch gestures, latency and this revision's native WebView rendering still need user testing. See desktop README for a short acceptance checklist. No system installs, GitHub push or workflow dispatch performed by the agent.

## First cloud-build failure and correction

- User's push created `origin/feature/desktop-straight-ink` successfully. Git ownership checking in their shell required a command-scoped `-c "safe.directory=$repo"`; this is now included in the cloud-build guide, without global trust changes.
- The first Windows run reached `Build native Windows executable and embedded frontend` and failed immediately: nested Yarn 1 scripts stripped the literal `--`, so Tauri rejected Cargo's `--locked` argument. This was a command forwarding error, before native application compilation.
- Corrected workflow to run `node ../node_modules/@tauri-apps/cli/tauri.js build --target x86_64-pc-windows-msvc --features custom-protocol --no-bundle --ci -- --locked` directly with working-directory `desktop`.
- Verified the actual command extracted from workflow YAML against the installed Tauri CLI: argument parsing passes and execution reaches `cargo metadata`. Local MSVC prerequisites remain absent. The user's subsequent cloud screenshot confirmed successful native build and artifact upload.
- This correction is committed locally for the user to push. Do not merely rerun the previous GitHub job: it uses the old commit. Do not push on the user's behalf.

## Latest native-build prerequisite check (2026-09-18)

- User authorized checking/building Windows locally, with an explicit stop before installing missing system components or switching to GitHub cloud builds.
- Found installed Microsoft Edge WebView2 Runtime 153.0.4234.32.
- Did not find MSVC compiler/linker on PATH, Visual Studio Installer/vswhere, the usual Visual Studio directories, registered VS/Windows SDK installation roots, or Windows Kits 10 libraries. Only GNU Rust in the workspace and MSYS2 GCC were found.
- Official Tauri Windows prerequisites require Microsoft C++ Build Tools and recommend the MSVC Rust toolchain: https://v2.tauri.app/zh-cn/start/prerequisites/#windows . Existing GNU storage-test success is not evidence that the complete desktop app can be built with the available environment.
- Attempted full-feature `cargo check --offline --locked`; it stopped before compilation because `adler2 v2.0.1` is not cached. This is a dependency-fetch failure, not a compiler diagnosis or successful check of app.rs.
- No system components installed, no new dependency downloads, no GitHub push or cloud build started, and no executable generated in this turn.
- User subsequently agreed to cloud builds. Windows-first configuration is now prepared locally; no push or workflow dispatch has occurred.

## Cloud-build preparation checkpoint

- Added `.github/workflows/desktop-windows.yml`, named `Desktop Windows preview`. A manual push to `feature/desktop-straight-ink` automatically starts a Windows-2022/x64 build, avoiding the default-branch requirement for first-time workflow_dispatch. User was informed of this trigger. Workflow has contents:read only, no releases, no signing secrets, no GitHub writes besides build artifacts; artifact retention 14 days.
- Workflow uses Node 24, Yarn 1.22.22, frozen Yarn lockfile, MSVC Rust stable on the cloud runner, 30 focused JS tests, TypeScript checks and 7 Rust storage tests, generated platform icons, full Tauri build with explicit custom-protocol and locked Cargo dependencies, then uploads a portable preview directory. Mac workflow is still pending by deliberate Windows-first staging.
- Added `custom-protocol` Cargo feature, platform icon configuration, desktop icons script and `desktop/scripts/package-windows.ps1` (refuses stale staging directories, copies exe/DLLs/MIT license/upstream font license metadata). Generated icons are ignored and regenerated in CI.
- Verified local icon generation, workflow YAML parsing, packaging PowerShell parsing, Tauri configuration structural schema validation (schema-specific format checks not validated by Ajv), `git diff --check`, and reran the 7 Rust storage tests with --offline --locked. This does NOT prove the cloud run or native desktop build succeeds.
- `desktop/CLOUD-BUILD.zh-CN.md` gives exact user steps: enable fork Actions first, provide public Git author identity, finish local commit, manually push using workspace MinGit, inspect Actions, download/extract artifact, use a disposable test folder.
- User supplied a screenshot of their GitHub email settings. Repository-local author configured as `fg155 <212271151+fg155@users.noreply.github.com>`; the private email shown in the screenshot was not used or copied into source. Global Git settings unchanged.
- Core gesture commit: `35f8e638` (`feat(editor): add opt-in straight ink gestures`). Desktop and Windows workflow follow in a separate local commit containing this checkpoint; use `git log -2` to find its hash. All 30 focused frontend tests were rerun successfully before committing. Credential manager exists in workspace MinGit; authentication is performed by user during their manual push, never by sharing tokens in chat.

## Repository and authorization

- Repository: `https://github.com/fg155/excalidraw.git` (`origin`).
- Official remote: `https://github.com/excalidraw/excalidraw.git` (`upstream`).
- Branch: `feature/desktop-straight-ink`.
- Starting commit: `c0ad61c6743aef7623e641cd1460d757cc6cacf3`.
- Work locally and eventually create logical local commits; **do not push**. User will push manually.
- Git author is configured locally from the user's screenshot; see cloud-build checkpoint above. Keep this identity unless the user asks to change it.
- User requested a pause at a suitable checkpoint; resume only when requested.
- Read root `AGENTS.md` before continuing. No nested AGENTS files were found.

## Agreed product

- Personal Tauri 2 desktop app, publicly forked code, Windows portable ZIP folder and Mac APP (Intel + Apple Silicon).
- No Docker or system-level development tool installation on user machines. Prefer bundled/local tools and GitHub Actions builds. Windows still needs WebView2; verify availability, do not assume every machine has it.
- Manual app replacement updates, stable application identifier, settings outside the program folder.
- Directory picker chooses a local OneDrive folder. Top-level board list, create/open/rename/recoverable delete. Standard `.excalidraw` JSON including images.
- Default autosave with debounce plus immediate Save / Ctrl+S / Cmd+S. Serialize saves, use atomic replacements and keep local recovery snapshots outside OneDrive. Show local save status; OneDrive cloud completion is not known.
- Detect externally changed files via content revisions; never silently overwrite a detected conflict, create a device/time-labelled copy. OneDrive sync is asynchronous: local revision checks cannot guarantee detecting two offline simultaneous writers. Document this limitation and keep independent local recovery copies.
- Settings local only, versioned/validated JSON import/export. Export drawing preferences/theme/gesture preferences, not directory paths, window dimensions or permissions. Preserve settings on update.
- Freehand tool: Shift held **before** pointer-down latches a straight gesture, start fixed, endpoint tracks pointer at arbitrary angles, release yields standard line. Mid-stroke Shift does not start the mode.
- Near-straight ordinary ink held at endpoint for ~500ms becomes a straight preview, same fixed first endpoint and movable second endpoint. Reject curves/backtracking/tiny strokes, allow toggling features and changing wait time.
- Preserve stroke color/width/opacity; user subsequently chose roughness 0 for converted lines only. Single undo step, keep freehand tool selected. Cover Escape, blur, cancellation, multiple pointers, pen and mouse.
- Future server/browser/cooperation possible through shared editor and repository boundary; no server/auth/sharing implementation now.

## Changes included in local preview commits

- `packages/excalidraw/straightInk.ts`: opt-in gesture controller, hold timer, near-line detector, temporary preview and standard-line conversion. ExcalidrawProps/App integration remains opt-in for upstream consumers.
- Geometry tests and real pointer integration tests: Shift onset, fixed origin/arbitrary angle, hold conversion, undo/redo, Escape/blur/pointer cancellation.
- Desktop React interface: directory selector, board list, new/open/rename/confirmed delete/import, recovery list, settings import/export and gesture preferences. Entry sets the local asset base before importing the editor.
- `desktop/src/session.ts`: debounced serialized save queue; updates during a write drain in order using returned revisions; detected conflict changes the active filename; failed saves retain dirty contents and block switching/closing; native recovery snapshot before writes.
- Settings whitelist/validation includes the current upstream `currentItemStrokeWidthKey`, not the obsolete numeric field. Undefined imported preferences are omitted instead of overwriting editor defaults. Corrupt stored settings disable automatic settings writes until explicit reset/import.
- `desktop/src-tauri`: Tauri 2 config, capability manifest and Rust commands for native file dialogs/settings/recovery. Storage library uses bounded standard JSON, filename/path confinement, SHA-256 revisions, same-directory atomic replacement, conflict copies and latest-20 local snapshots. Snapshot ordering is monotonic even within one millisecond. Corrupt external contents are preserved while valid local contents go to a conflict copy.
- Root desktop workspace/scripts, updated Yarn lockfile and Cargo lockfile. Cargo.lock retains canonical crates.io sources; temporary local registry proxy is NOT in the repository.
- Frontend production output exists in ignored `desktop/dist/`, including 234 WOFF2 assets. This is not an executable; native offline asset loading still needs real WebView testing.

## Checks and environment

- Desktop and shared source TypeScript check passed: `node node_modules/typescript/bin/tsc --noEmit --pretty false -p desktop/tsconfig.json`. The new desktop tests are also included. Root typecheck passed earlier and is rerun at handoff.
- ESLint passed for all desktop TypeScript plus straightInk implementation/tests. Prettier applied. Native rustfmt is not installed in the portable minimal toolchain, so Rust formatting remains pending.
- Latest JavaScript/React check: 105 passed and 1 existing upstream todo across desktop App (4), session (5), settings (10), straightInk geometry (3), pointer integration (6), straightInk pen/render tests (19), existing freedrawMode (2), upstream linear editor (56 passed, 1 todo). Desktop tests use the real editor and mocked native IPC, not a real native window.
- 7 Rust storage tests pass with `cargo test --no-default-features`: roundtrip/conflict, bad paths/data, rename/delete/recovery, persistence, unavailable directory recovery, bounded/ordered snapshots, corrupt external-file conflict. This excludes Tauri app.rs/desktop-feature compilation.
- Vite production build passed. Bundling emits upstream dependency `use client` warnings, but no build error. Offline runtime/CSP behavior has not yet been validated in a native window.
- Native esbuild config loading is denied access to an ancestor directory in this environment. Workspace-only `../../work/run-tests.mjs` and `../../work/build-desktop.mjs` load the actual repository configs via TypeScript transpilation and use the programmatic Vitest/Vite APIs. No production config behavior was replaced. Run these helpers from workspace root (`node work/run-tests.mjs ...`, `node work/build-desktop.mjs`).
- Yarn install completed using `--ignore-scripts --non-interactive` and workspace cache; lockfile updated. Root Husky prepare cannot resolve its executable through this environment's subprocess PATH, so commands use explicit Node script paths.
- Bundled Node: `C:/Users/fg155/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` (24.19.0).
- Downloaded portable Yarn 1.22.22 under `../../work/package/bin/yarn.js`; cache `../../work/yarn-cache` relative to repository. Do not install global Yarn.
- Downloaded portable MinGit under `../../work/mingit`. HTTPS helper resolution required explicit `--exec-path` pointing to its `mingw64/bin` directory. Clone succeeded with that and `-c http.sslBackend=openssl`.
- Repo-local `http.sslBackend=openssl` set; no global Git configuration changed.
- Portable minimal Rust stable 1.98.1 GNU toolchain installed only under workspace `work/rustup` and `work/cargo`, no system PATH change. Set task-local CARGO_HOME/RUSTUP_HOME to those directories before use. Storage tests use available MinGW tooling; full Tauri compiler/linker requirements still need validation.
- Cargo's Windows TLS backend failed credentials. Workspace-only `work/cargo-proxy.mjs` forwarded registry requests through Node HTTPS with certificate validation to loopback port 18379. `work/cargo/config.toml` points to this proxy. The helper is stopped at this checkpoint; offline storage tests use the cache. Future registry downloads require restarting this helper or fixing the underlying TLS issue without disabling validation.
- No GitHub write/auth performed, no workflow dispatched, no system components installed.

## Next implementation steps

1. Ask the user to push the latest straight-ink correction and download its new Windows artifact. Previous full Tauri Windows build and packaging succeeded; this revision has only been checked locally at frontend/test level. Do not treat frontend build as a native build.
2. Add macOS (Intel + Apple Silicon) CI packaging workflow; do not push/dispatch. Windows workflow exists and succeeded. Preserve licenses. Document artifact retrieval and unsigned/ad-hoc signing limitations. Stable identifier must remain `io.github.fg155.excalidraw-personal`.
3. Native runtime validation: real dialogs/close/error flows, settings upgrade persistence, image roundtrip/export, local fonts with network disabled, CSP/native IPC restrictions, OneDrive behavior, recovery UI and visual/layout/accessibility QA. UI currently has no visual screenshot verification; modal focus trapping remains to be added.
4. Storage hardening before release: enforce single-instance or cross-process locking (current mutex serializes only one process); review hard-link rename portability with OneDrive/APFS; handle corrupt directory.json without preventing recovery/startup. External OneDrive writes cannot be fully transactional with local revision checks. Recovery pre-save snapshots currently duplicate some states during native save; review retention efficiency.
5. Physical tablet acceptance: pressure, hardware buttons, hover, palm rejection, multi-touch, zoom and preview/final width. Pen/zoom/tool changes/timers/styles/negative coordinates are now covered by simulated regression tests, not real-device validation.
6. Improve active-list refresh after automatic conflict save, test autosave timer directly, review settings error/reset behavior and main-window reloading. Full regression suite still pending.
7. After user manually pushes, inspect the actual cloud-build result if provided, fix compiler/build errors locally, and ask user to push the next commit. Do not claim the preview works until native compilation and runtime checks succeed. User pushes manually; do not push automatically.

Local paths under `work/` contain intermediate tooling; user-facing project source is under `outputs/excalidraw/`.
