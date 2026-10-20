<p align="center">
  <img src="./public/favicon.svg" width="72" height="72" alt="Excalidraw Personal icon" />
</p>

<h1 align="center">Excalidraw Personal</h1>

<p align="center">A desktop whiteboard for handwriting, diagrams, and math notes.</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#download">Download</a> ·
  <a href="#development">Development</a> ·
  <a href="#credits-and-license">License</a>
</p>

Built on [Excalidraw](https://github.com/excalidraw/excalidraw), with offline editing, a board gallery, and native file storage.

> Development preview for Windows x64 and macOS Apple Silicon. See [project status](#project-status).

## Features

### Board management

Your boards live in local `.excalidraw` files. Browse their thumbnails in the gallery, where you can create, open, import, rename, and delete them. The gallery stays out of the way while you draw; the top-left button takes you back.

Changes save automatically. You can also save with `Ctrl+S` / `Cmd+S`. Deleted boards go to device-local trash, which holds up to 10 boards for 10 days. Historical save backups are separate. Settings survive manual app updates and can be exported or imported.

### Handwriting and drawing

- Freehand strokes retain pressure when the pen and driver report it.
- Hold Shift **before starting a stroke** for a straight line at any angle. You can also pause at the end of a near-straight stroke to straighten it.
- Stroke width has presets and a slider from 0.5 to 32. Straightened strokes use a uniform width calculated from the original stroke.
- The eraser leaves images and text intact, including LaTeX text, grouped content, and content in an erased frame. To remove them, select them and press Delete.

Each board has its own paper color and pattern, independent of snapping. Choose from 10 colors and 9 styles: plain, dots, square, dense grid, major/minor grid, diamond, wide ruled, triangle, and narrow ruled.

### Text and equations

Each text block has its own Plain text or LaTeX setting; there is no global switch. New text and pasted plain text use the last-selected mode, even after a restart. Copied drawing elements keep their own mode.

Mix prose with `$...$`, `$$...$$`, `\(...\)`, or `\[...\]` formulas and edit the source whenever you need to. Bundled MathJax renders the equations offline, so no system TeX installation or remote service is needed. PNG and SVG exports include rendered formulas and, optionally, paper backgrounds.

LaTeX mode covers base/AMS math. It does not parse Markdown or full TeX documents. Unsupported formulas stay visible as source.

## Download

Download preview packages from [GitHub Actions](https://github.com/fg155/excalidraw/actions).

| Platform | Build workflow | Package |
| --- | --- | --- |
| Windows x64 | [Desktop Windows preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-windows.yml) | Portable folder in a ZIP |
| macOS Apple Silicon | [Desktop macOS preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-macos.yml) | DMG inside a ZIP |

<details>
<summary>Artifact names</summary>

- Windows: `Excalidraw-Personal-Windows-x64-<run>`
- macOS: `Excalidraw-Personal-macOS-arm64-<run>`

</details>

Sign in to GitHub, open a successful run, then choose Summary and download the package under Artifacts. Packages expire after 14 days. Windows and Mac have separate runs, so check the platform before downloading.

- Windows: extract the entire ZIP, then run `excalidraw-personal.exe`. WebView2 Runtime is required.
- Mac: extract the ZIP on your Mac, open the DMG, and drag Excalidraw Personal.app into Applications. The Mac package targets ARM64. Intel and Universal builds are not provided.
- Mac builds use ad-hoc signing without Apple notarization, so macOS may ask for approval when opening the app.

To update, close the app and replace the application files. Keep the application-data directory to retain your settings.

## Files and settings

Boards are `.excalidraw` JSON files with their referenced images embedded. Paper styles and text modes use custom fields, so other Excalidraw versions may not display them the same way.

You can use a local folder or one synced by OneDrive or a similar service. The saved indicator confirms the local write only; it does not track cloud uploads. The app has no built-in sync service or real-time collaboration. Avoid editing the same board on multiple devices at once.

When saving detects a file changed outside the app, it creates a conflict copy. Writes use atomic replacement and keep local recovery snapshots. Keep an independent backup of important boards.

- Deleted drawing elements remain in memory for in-session undo but are omitted from desktop board saves. Switching boards or closing the app does not preserve that undo history.
- Settings, trash, and recovery snapshots are device-local, separate from the program folder. Move boards separately and export/import settings when moving between Windows and Mac; select the board folder again on the new device.
- Expired trash is cleaned while the app is running or on the next launch, not by a background service while the app is closed.

## Development

The desktop shell uses Tauri 2 and Rust. The interface uses React, TypeScript, and Vite, with Excalidraw for editing and MathJax for equations.

Use Node.js 24 and Yarn 1.22.22 to match CI. Native development also requires Rust, the platform's build tools, and WebView dependencies.

```bash
git clone --branch feature/desktop-straight-ink https://github.com/fg155/excalidraw.git
cd excalidraw
yarn install --frozen-lockfile

# Frontend only; native file operations require the Tauri application.
yarn desktop:dev
yarn desktop:build

# Native development, after installing platform prerequisites.
yarn --cwd desktop icons
yarn desktop:tauri dev
```

`desktop:build` produces frontend assets, not an EXE or app bundle. Native packaging commands and checks are maintained in the [Windows workflow](./.github/workflows/desktop-windows.yml) and [Mac workflow](./.github/workflows/desktop-macos.yml). Both currently run on pushes to `feature/desktop-straight-ink`; forks need Actions enabled.

<details>
<summary>Type checks and tests</summary>

```bash
yarn tsc --noEmit --pretty false
yarn --cwd desktop typecheck
yarn vitest run packages/excalidraw/tests/imageEraser.test.tsx packages/excalidraw/tests/latex.test.tsx
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml --no-default-features
node --test desktop/scripts/macos-workflow.test.cjs
```

The workflows contain the full desktop-focused test list. The commands above run the eraser/math and native storage tests.

</details>

<details>
<summary>Source layout</summary>

```text
desktop/src/                 Desktop UI, board gallery, settings, save queue
desktop/src-tauri/           Native application and local file storage
packages/excalidraw/         Editor UI, drawing interactions, integration tests
packages/element/            Geometry, text/math layout, rendering
.github/workflows/desktop-*  Windows and macOS preview builds
```

</details>

## Project status

Windows previews have been built and run. The Mac ARM64 workflow is configured; on-device validation is pending.

Regression tests cover saving, undo/redo, simulated pen input, text/image eraser protection, paper backgrounds, and math rendering. Cross-process file locking is not yet implemented; open each board in one app instance at a time.

When reporting a bug, include your platform, build commit or run number, and steps to reproduce it. For pen input issues, add the tablet model and driver version. Remove private content from sample boards.

## Credits and license

The editor, drawing tools, and core file format come from [Excalidraw](https://github.com/excalidraw/excalidraw). This fork adds local board management and the desktop features described above.

Licensed under the [MIT License](./LICENSE). Math rendering uses MathJax; see [math dependency notices](./desktop/MATH-NOTICES.txt).
