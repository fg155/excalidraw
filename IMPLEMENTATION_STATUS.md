# Implementation checkpoint — deferred snapshots and compact desktop saves

This remains a development preview. Windows previously built and ran. The user pushed two Mac workflow versions: the first failed at lipo argument parsing, the second could not find the intermediate .app after DMG-only bundling. The latest correction below is local only and needs a new user-pushed build and native Mac acceptance. Resume here rather than starting again.

## Desktop save performance revision (2026-09-28)

- User reported cross-device lag on an existing board but not a new one. Read-only inspection found 2,817 elements: 402 live and 2,415 deleted, in a roughly 6 MB file; images were small. Encoding the original parsed JSON locally took about 20 ms versus about 1.8 ms with only live elements (Node microbenchmark, not a native frame-time measurement). The desktop onChange callback eagerly encoded the full document before its save queue's debounce, repeatedly processing historical tombstones on the UI thread. User approved optimizing persistence, retaining in-session undo and releasing old-document references without capping undo.
- Added desktop-only `boardSnapshot.ts`: serialize live elements and their referenced image files through the existing export serializer without mutating scene objects, simplifying points or recompressing images. Lightweight change detection uses the upstream order-sensitive version-nonce hash, array/file identities and only exportable app-state fields; cursor/viewport-only changes do not reset save debounce. Shared upstream serialization and collaboration behavior are unchanged.
- DocumentSession accepts lazy snapshot functions, replaces them during edits and encodes after the 600 ms debounce or immediately for explicit save/switch/close. Save-status notifications no longer force a shell rerender for each pending edit. Materializes strings before async backup/write, drains edits arriving during IO using returned revisions/conflict names, and retains failed encoding/writes for retry. Disposal clears the timer, deferred closure and saved/current string references.
- Opening a legacy board filters its historical tombstones before initializing the new editor (there is no previous-session undo stack to preserve). Merely opening does not rewrite the file; a subsequent edit/autosave or explicit save/home/close writes the compact snapshot via the normal backup/conflict path. Deletions made during the current editing session remain in memory and undo works even after saving. Gallery/switch unmounts the editor as before; no claim that the OS immediately returns heap memory or that there is a fixed RAM multiplier limit.
- Original user OneDrive file was not edited or replaced by the agent, and its content was not copied into repository fixtures. Board trash and existing independent recovery snapshots are untouched. No native compiler install, GitHub push, cloud dispatch or physical tablet test. User manually pushes and tests a downloaded new build, preferably on a copy first.
- Verification: 209 focused JS/React tests passed across 14 files, plus 1 existing upstream todo; 4 macOS workflow regression checks passed. Root and desktop TypeScript, targeted ESLint, Prettier, frontend production build and diff checks passed. Added tests cover 100 deferred updates/idle saving, failed serialization/retry, compaction only on flush, disposal, image retention, no heavy point traversal, old-file load/save, deletion-save-undo/reopen and 25 drawing/viewport updates causing zero board serializations until one explicit save. Both Windows and Mac CI include the new snapshot tests. Native responsiveness and memory behavior still need user-device validation.

## Mac retained-app correction after second cloud run

- Verified the installed CLI is 2.11.4 and inspected the matching upstream `tauri-cli-v2.11.4` bundler source: `crates/tauri-bundler/src/bundle.rs` explicitly deletes intermediate .app bundles when only DMG is requested. This explains the missing bundle in the user's second screenshot; fixing lipo's argument order alone was insufficient.
- Build now explicitly requests `--bundles app,dmg`. Verification selects exactly one actual .app in the target's macos bundle folder, reads CFBundleExecutable with PlistBuddy, checks the binary exists/is executable, logs resolved paths and then performs the ARM64/signature checks. Upload remains DMG-only with licenses; no raw .app upload, signature bypass or new signing identity.
- Added four Node configuration regression tests to the repository and macOS CI, covering app retention, bundle/executable lookup, lipo ordering/mandatory validation, and DMG artifact isolation. These checks run on Windows but do not emulate Tauri, lipo, codesign or macOS execution. Local tests, formatting and diff checks are required before committing; cloud validation and M5 launch remain pending. No push/dispatch by the agent.

## Mac verification correction after first cloud run

- Screenshot shows Apple's lipo interpreting the executable path after `-verify_arch arm64` as another architecture. Fixed argument order to `lipo "$app/Contents/MacOS/excalidraw-personal" -verify_arch arm64`, as required by Apple's lipo manual. Retained architecture and signature checks; did not bypass the failed validation. The screenshot does not establish that signature verification, artifact staging/upload or native runtime succeeded.
- Both workflows previously inherited the same commit message as their run title, so the macOS-related commit title also appeared on the Windows run. Added explicit `run-name` labels `Mac ARM64` and `Windows x64`, and documented how to distinguish runs/artifacts and why rerunning the old commit would retain the bug. Successful Windows artifacts are not Mac installers.
- No application code, settings, signing identity or data changed. Local YAML/command-order assertions, formatting and diff checks are used for this narrow workflow fix; macOS lipo/codesign and artifact upload still require the new cloud run. No GitHub push/dispatch by the agent.

## Latest Apple Silicon cloud-build revision (2026-09-25)

- User requested GitHub builds for their M5 Mac and approved adding the workflow. Added `.github/workflows/desktop-macos.yml`, named `Desktop macOS preview`: independent of the unchanged Windows workflow, runs on pushes to `feature/desktop-straight-ink`, macos-15 ARM64 runner, explicit `aarch64-apple-darwin` target, Node 24/Yarn 1.22.22, frozen JS and locked Rust dependencies, the same 12-file focused frontend test list, typechecks and native storage tests.
- Direct Tauri CLI invocation preserves Cargo's `-- --locked` separator and explicitly bundles a DMG. CI checks the bundled executable's arm64 architecture and ad-hoc application signature before staging the DMG, MIT/font license texts, Chinese install notes and SHA-256 checksum. Upload the DMG rather than a raw .app directory to preserve macOS bundle permissions/symlinks. Artifact retention is 14 days. No Intel/Universal build in this revision.
- Reuses the stable identifier `io.github.fg155.excalidraw-personal` and existing macOS signingIdentity `-`. No notarization, Apple secrets, releases, source/settings changes, local native tool installs, GitHub push or workflow dispatch. Contents permission remains read-only; user manually pushes. Initial Mac launch may require explicit OS trust after verifying the build source; never disable system protection globally.
- Updated the cloud-build guide and desktop overview, and added `desktop/MACOS-PREVIEW.zh-CN.txt`. Documents Summary > Artifacts download, DMG installation, manual settings/board migration, device-local recovery data and first native/tablet checks.
- Local checks passed: YAML parsing and assertions for trigger, permissions, target, CLI forwarding, signing identity, artifact/required input paths and test-list parity with Windows; all 141 tests across the 12 CI frontend files; production frontend build. Formatting and diff checks completed before commit. This Windows host cannot validate the macOS native build, DMG creation or Gatekeeper/native tablet behavior; these remain pending the first user-pushed GitHub build and M5 run.

## Latest stroke-width / image-protection revision (2026-09-18)

- Added a 0.5–32 half-step stroke-width slider below the original three presets, using the existing freedraw schema's half-width mapping. Custom preference is separate from the legacy preset key, validated on restore/settings import, persisted in desktop preferences and applied to creation/shape conversion. Existing element numeric widths are unchanged until explicitly edited. Selecting a preset clears the custom override.
- Fixed straight-ink width: numeric freedraw strokeWidth is not its visible diameter. Constant mode uses the laser renderer's 1.4 radius multiplier (2.8 diameter); variable mode shares the perfect-freehand size/thinning/easing formula. Shift line width is a distance-weighted running average of current pen-pressure widths, avoiding reliance on a light initial touchdown. Hold conversion averages the existing stroke and latches the width. Conversion is applied once, preview and release retain the same width; old drawings are not rewritten. Mouse simulated-pressure variable strokes use nominal pressure 0.5.
- Images are excluded from eraser hit candidates, tap hits, group expansion, preview dimming and final deletion/binding cleanup. When a frame is erased, surviving images detach from that frame. Normal explicit Delete and undo remain available. No OS/tablet driver settings changed.
- Checks: 197 focused tests passed, 1 upstream todo, across 13 files. New tests cover slider/preset creation and selected-object undo, restored width validation, actual rendered brush diameter at different pressures, Shift/hold width through release, picture-overlaid ink erasure via tap/drag/hardware eraser, groups, frames/undo and explicit image deletion. Root/desktop typecheck, targeted ESLint, diff check and production frontend build passed. Browser UI QA with mock native IPC verified slider selection at 7.5 and a visibly thicker stroke; no real board files used.
- Still local-only: user manually pushes to build the Windows executable. No native build/tool installation, GitHub write or physical Huion L610 acceptance by the agent. Native and physical-tablet behavior needs the user's new-artifact test.

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
2. Apple Silicon Mac workflow is now prepared (see 2026-09-25 checkpoint); user must push and report the first native build/run result. Intel/Universal remains unimplemented and is not needed for the user's M5. Do not push/dispatch. Preserve the stable identifier `io.github.fg155.excalidraw-personal`.
3. Native runtime validation: real dialogs/close/error flows, settings upgrade persistence, image roundtrip/export, local fonts with network disabled, CSP/native IPC restrictions, OneDrive behavior, recovery UI and visual/layout/accessibility QA. UI currently has no visual screenshot verification; modal focus trapping remains to be added.
4. Storage hardening before release: enforce single-instance or cross-process locking (current mutex serializes only one process); review hard-link rename portability with OneDrive/APFS; handle corrupt directory.json without preventing recovery/startup. External OneDrive writes cannot be fully transactional with local revision checks. Recovery pre-save snapshots currently duplicate some states during native save; review retention efficiency.
5. Physical tablet acceptance: pressure, hardware buttons, hover, palm rejection, multi-touch, zoom and preview/final width. Pen/zoom/tool changes/timers/styles/negative coordinates are now covered by simulated regression tests, not real-device validation.
6. Improve active-list refresh after automatic conflict save, test autosave timer directly, review settings error/reset behavior and main-window reloading. Full regression suite still pending.
7. After user manually pushes, inspect the actual cloud-build result if provided, fix compiler/build errors locally, and ask user to push the next commit. Do not claim the preview works until native compilation and runtime checks succeed. User pushes manually; do not push automatically.

Local paths under `work/` contain intermediate tooling; user-facing project source is under `outputs/excalidraw/`.
