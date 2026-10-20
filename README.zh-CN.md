# Excalidraw Personal

用于手写、绘图和数学笔记的离线优先桌面白板。基于 [Excalidraw](https://github.com/excalidraw/excalidraw)，增加本地画板管理与原生文件存储。

[English](./README.md) · **简体中文**

[功能](#功能) · [下载](#下载) · [开发](#开发) · [许可证](#致谢与许可证)

> 开发预览版。仓库包含 Windows x64 和 macOS Apple Silicon 构建工作流。请备份重要画板，使用前先阅读[项目状态](#项目状态)。

## 功能

### 画板管理

- 在缩略图首页浏览画板，新建、打开、导入、重命名和删除本地 `.excalidraw` 文件。
- 绘图时不占用常驻画板侧栏；通过左上角按钮返回首页。
- 自动保存到本机，也可通过 `Ctrl+S` / `Cmd+S` 主动保存。
- 本机回收站最多保留 10 个画板，保留期限为 10 天；历史保存备份独立管理。
- 手动更新应用时保留设置，支持设置导入与导出。

### 手写与绘图

- 当数位笔及驱动提供压力数据时，保留自由笔画的压感。
- **起笔前按住 Shift** 绘制任意角度直线，或在近似直线的末端停顿，将笔画拉直。
- 使用粗细预设或 **0.5–32** 滑块调整描边。转换后的直线采用根据笔画换算的等宽线条。
- 橡皮擦除笔迹，不擦除图片、普通文字和 LaTeX 文字；组合或图框被擦除时也保留这些内容。需要删除时，选中后按 Delete。
- 10 种纸张颜色与 9 种背景样式：纯色、点阵、方格、密方格、主次网格、菱形、宽横线、三角形和窄横线。背景按画板保存，与网格吸附独立。

### 文字与公式

- 每个文字块独立选择**普通文字**或 **LaTeX**，没有全局模式开关。
- 新建文字及粘贴的纯文本继承上次使用的模式，重启后仍记住；复制的画板元素保留自身模式。
- 在正文中混排 `$...$`、`$$...$$`、`\(...\)` 和 `\[...\]` 公式，原始源码仍可编辑。
- 内置 MathJax 离线渲染，无需安装系统 TeX 或使用远程渲染服务。
- 使用 Excalidraw 的导出工具生成 PNG 和 SVG，包含渲染后的公式，并可选择带上纸张背景。

LaTeX 模式支持精简的 base/AMS 数学语法，不是 Markdown 或完整 TeX 文档排版。不支持的公式会保留为可见源码，不会直接消失。

## 下载

预览包由 [GitHub Actions](https://github.com/fg155/excalidraw/actions) 生成，不作为稳定版 Release 发布。

| 平台 | 工作流 | 产物名称 | 内容 |
| --- | --- | --- | --- |
| Windows x64 | [Desktop Windows preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-windows.yml) | `Excalidraw-Personal-Windows-x64-<run>` | ZIP 中的便携应用文件夹 |
| macOS Apple Silicon | [Desktop macOS preview](https://github.com/fg155/excalidraw/actions/workflows/desktop-macos.yml) | `Excalidraw-Personal-macOS-arm64-<run>` | ZIP 中的 DMG 安装包 |

登录 GitHub，打开一次**成功的运行记录**，进入 **Summary**，在 **Artifacts** 下载对应平台的包。当前工作流配置保留产物 14 天。Windows 构建成功不代表已生成 Mac 安装包。

- **Windows：**完整解压 ZIP，运行 `excalidraw-personal.exe`。系统需要 WebView2 Runtime。
- **Mac：**在 Mac 上解压 ZIP，打开 DMG，将 **Excalidraw Personal.app** 拖入“应用程序”。这是 ARM64 版本，适用于Apple Silicon，不是 Intel 或 Universal 版本。
- 预览包不是具有正式发布签名的版本。Mac 使用 ad-hoc 临时签名，未经 Apple 公证。请核对下载来源，不要关闭操作系统安全防护。

初次使用请先选择单独的测试文件夹。更新需手动进行：关闭旧版本、备份画板后替换应用，不要删除应用数据目录。

## 文件与设置

画板使用 `.excalidraw` JSON，并嵌入所引用的图片。自定义纸张和文字模式属于扩展字段，其他版本的 Excalidraw 不一定能还原这些功能。

可选择本地文件夹，或由 OneDrive 等服务同步的文件夹。**“已保存”表示已保存到本机，不表示已上传云端。**桌面应用不提供自己的同步服务或实时协作功能，请避免多台设备同时编辑同一画板。

保存时检查外部内容变化，发现冲突后另存冲突副本。原子文件替换和本机恢复快照有助于保护数据，但不能保证离线多端编辑完全无冲突，也不能代替独立备份。

- 已删除的绘图元素在当前会话中留在内存供撤销使用，但不会写入桌面画板存档。切换画板或关闭应用后不保留这段撤销历史。
- 设置、回收站和恢复快照保存在本机，与程序目录分开。跨 Windows / Mac 迁移时需另行移动画板、导出／导入设置，并在新设备重新选择画板文件夹。
- 回收站在应用运行期间或下次启动时清理过期项目，应用关闭时没有后台清理服务。

## 开发

使用 **Tauri 2 / Rust**、**React / TypeScript / Vite**、Excalidraw 编辑器及 **MathJax**。

使用 Node.js 24 和 Yarn 1.22.22，与 CI 保持一致。原生开发还需准备 Tauri 对应平台的依赖：Rust、本机编译工具和 WebView 依赖。仅安装 JavaScript 依赖并不能获得完整的原生构建环境。

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

### 检查

```bash
yarn tsc --noEmit --pretty false
yarn --cwd desktop typecheck
yarn vitest run packages/excalidraw/tests/imageEraser.test.tsx packages/excalidraw/tests/latex.test.tsx
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml --no-default-features
node --test desktop/scripts/macos-workflow.test.cjs
```

完整的桌面相关测试列表见工作流。以上命令包含橡皮／公式专项测试和原生存储测试，不等同于完整的原生端到端测试。

### 源码结构

```text
desktop/src/                 桌面界面、画板首页、设置、保存队列
desktop/src-tauri/           原生应用与本地文件存储
packages/excalidraw/         编辑器界面、绘图交互、集成测试
packages/element/            元素几何、文字／公式排版、渲染
.github/workflows/desktop-*  Windows 与 macOS 预览构建
```

## 项目状态

这是面向桌面使用的定制分支，不是 Excalidraw 官方桌面版。Windows 预览版已有构建和运行记录。仓库包含 Mac ARM64 工作流，但具体版本的打包结果与设备行为仍需验证，此处不将其标为已验证的 Mac 稳定版。

回归测试覆盖保存、撤销／重做、数位笔手势、文字／图片擦除保护、纸张背景和公式渲染。模拟指针测试不代表所有数位板及驱动均已通过认证。原生 WebView 行为、跨设备文件同步与实体数位笔输入仍需实机测试。尚未实现跨进程文件锁，请避免多个应用实例同时打开同一画板。

反馈问题时，请提供平台、构建提交或运行编号、复现步骤；涉及数位板时补充设备型号和驱动版本。示例画板请尽量精简，不包含私人内容。

## 致谢与许可证

编辑器、绘图工具和核心文件格式来自 [Excalidraw](https://github.com/excalidraw/excalidraw)。本分支增加了桌面工作流与上述定制功能，与上游项目没有隶属关系，也不代表上游官方背书。

项目采用 [MIT 许可证](./LICENSE)，保留 Excalidraw 的版权声明。数学渲染使用 MathJax，详见[数学依赖声明](./desktop/MATH-NOTICES.txt)。预览包包含相应的数学和字体许可说明。
