<p align="center">
  <img src="./public/favicon.svg" width="72" height="72" alt="Excalidraw Personal 图标" />
</p>

<h1 align="center">Excalidraw Personal</h1>

<p align="center">用于手写、绘图和数学笔记的桌面白板。</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#功能">功能</a> ·
  <a href="#下载">下载</a> ·
  <a href="#开发">开发</a> ·
  <a href="#致谢与许可证">许可证</a>
</p>

基于 [Excalidraw](https://github.com/excalidraw/excalidraw)，支持离线编辑、画板缩略图管理和原生文件存储。

> Windows x64 / macOS Apple Silicon 开发预览版，详见[项目状态](#项目状态)。

## 功能

### 画板管理

画板保存在本地 `.excalidraw` 文件中。首页以缩略图展示画板，可以新建、打开、导入、重命名和删除。进入编辑器后不显示画板侧栏，点击左上角按钮即可返回首页。

修改自动保存，也可以按 `Ctrl+S` / `Cmd+S` 主动保存。删除的画板进入本机回收站，最多保留 10 个，期限为 10 天。历史保存备份单独管理。手动更新应用会保留设置，也可以导出、导入设置。

### 手写与绘图

- 数位笔和驱动提供压力数据时，自由笔画保留压感。
- **起笔前按住 Shift** 可画任意角度的直线；也可以在近似直线末端停顿，让笔画拉直。
- 描边支持粗细预设和 0.5 至 32 的滑块。拉直后的笔画为等宽线条，粗细根据原笔画换算。
- 橡皮不会擦除图片、普通文字或 LaTeX 文字。组合或图框被擦除时，这些内容也会保留；需要删除时，选中后按 Delete。

每张画板单独保存纸张颜色和图案，与吸附设置互不影响。可选 10 种颜色和 9 种样式：纯色、点阵、方格、密方格、主次网格、菱形、宽横线、三角形和窄横线。

### 文字与公式

每个文字块独立选择普通文字或 LaTeX，没有全局开关。新建文字和粘贴的纯文本沿用上次选择的模式，重启后也会记住。复制的画板元素保留自身模式。

正文可以混排 `$...$`、`$$...$$`、`\(...\)` 和 `\[...\]` 公式，源码随时可编辑。内置 MathJax 在本机渲染，无需安装系统 TeX，也不调用远程服务。导出的 PNG 和 SVG 包含渲染后的公式，还可以选择带上纸张背景。

LaTeX 模式支持 base/AMS 数学语法，不支持 Markdown 或完整 TeX 文档排版。无法渲染的公式会显示源码。

## 下载

预览包可从 [GitHub Actions](https://github.com/fg155/excalidraw/actions) 下载。

| 平台 | 构建工作流 | 安装包 |
| --- | --- | --- |
| Windows x64 | [Desktop Windows preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-windows.yml) | ZIP 中的便携应用文件夹 |
| macOS Apple Silicon | [Desktop macOS preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-macos.yml) | ZIP 中的 DMG |

<details>
<summary>构建产物名称</summary>

- Windows：`Excalidraw-Personal-Windows-x64-<run>`
- macOS：`Excalidraw-Personal-macOS-arm64-<run>`

</details>

登录 GitHub，打开一次成功的运行记录，在 Summary 页面的 Artifacts 中下载。产物保留 14 天。Windows 和 Mac 分别构建，下载前请确认平台。

- Windows：完整解压 ZIP，运行 `excalidraw-personal.exe`。系统需要 WebView2 Runtime。
- Mac：在 Mac 上解压 ZIP，打开 DMG，将 Excalidraw Personal.app 拖入“应用程序”。Mac 包面向 ARM64。目前不提供 Intel 或 Universal 版本。
- Mac 使用 ad-hoc 临时签名，未经 Apple 公证，首次打开时系统可能要求确认。

更新时关闭应用并替换程序文件，保留应用数据目录即可保留设置。

## 文件与设置

画板是 `.excalidraw` JSON 文件，引用的图片嵌入其中。纸张样式和文字模式使用扩展字段，在其他版本的 Excalidraw 中可能显示不同。

可以选择本地文件夹，也可以选择 OneDrive 等服务同步的文件夹。保存状态只确认本机写入，不追踪云端上传进度。应用没有内置同步服务或实时协作功能，请避免多台设备同时编辑同一画板。

保存时如果检测到文件被其他程序修改，会生成冲突副本。写入采用原子替换，并保留本机恢复快照。重要画板请另行备份。

- 已删除的绘图元素在当前会话中留在内存供撤销使用，但不会写入桌面画板存档。切换画板或关闭应用后不保留这段撤销历史。
- 设置、回收站和恢复快照保存在本机，与程序目录分开。跨 Windows / Mac 迁移时需另行移动画板、导出／导入设置，并在新设备重新选择画板文件夹。
- 回收站在应用运行期间或下次启动时清理过期项目，应用关闭时没有后台清理服务。

## 开发

桌面端使用 Tauri 2 和 Rust，界面使用 React、TypeScript 和 Vite。编辑器基于 Excalidraw，公式由 MathJax 渲染。

使用 Node.js 24 和 Yarn 1.22.22，与 CI 保持一致。原生开发还需要 Rust、对应平台的编译工具和 WebView 依赖。

```bash
git clone --branch feature/desktop-straight-ink https://github.com/fg155/excalidraw.git
cd excalidraw
yarn install --frozen-lockfile

# 仅前端；原生文件操作需要 Tauri 应用。
yarn desktop:dev
yarn desktop:build

# 准备好本机原生依赖后，运行原生开发应用。
yarn --cwd desktop icons
yarn desktop:tauri dev
```

`desktop:build` 只生成前端资源，不生成 EXE 或应用包。原生打包命令和检查步骤以 [Windows 工作流](./.github/workflows/desktop-windows.yml)和 [Mac 工作流](./.github/workflows/desktop-macos.yml)为准。目前两者均在推送到 `feature/desktop-straight-ink` 时运行；fork 仓库需先启用 Actions。

<details>
<summary>类型检查与测试</summary>

```bash
yarn tsc --noEmit --pretty false
yarn --cwd desktop typecheck
yarn vitest run packages/excalidraw/tests/imageEraser.test.tsx packages/excalidraw/tests/latex.test.tsx
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml --no-default-features
node --test desktop/scripts/macos-workflow.test.cjs
```

完整的桌面相关测试列表见工作流。以上命令运行橡皮／公式专项测试和原生存储测试。

</details>

<details>
<summary>源码结构</summary>

```text
desktop/src/                 桌面界面、画板首页、设置、保存队列
desktop/src-tauri/           原生应用与本地文件存储
packages/excalidraw/         编辑器界面、绘图交互、集成测试
packages/element/            元素几何、文字／公式排版、渲染
.github/workflows/desktop-*  Windows 与 macOS 预览构建
```

</details>

## 项目状态

Windows 预览版已有构建和运行记录。Mac ARM64 工作流已配置，实机验证待完成。

回归测试覆盖保存、撤销／重做、模拟数位笔输入、文字／图片擦除保护、纸张背景和公式渲染。尚未实现跨进程文件锁，同一画板请只在一个应用实例中打开。

反馈问题时，请提供平台、构建提交或运行编号、复现步骤；涉及数位板时补充设备型号和驱动版本。示例画板请尽量精简，不包含私人内容。

## 致谢与许可证

编辑器、绘图工具和核心文件格式来自 [Excalidraw](https://github.com/excalidraw/excalidraw)。本分支增加了本地画板管理和上述桌面功能。

项目采用 [MIT 许可证](./LICENSE)。数学渲染使用 MathJax，详见[数学依赖声明](./desktop/MATH-NOTICES.txt)。
