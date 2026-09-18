# 用 GitHub 构建桌面预览版

仓库提供 Windows x64 和 macOS Apple Silicon 两条构建工作流。构建工具安装在 GitHub runner 上，下载应用无需在本机安装 Rust、Node 或 Xcode。

## 构建

1. 在自己的 fork 中启用 Actions。
2. 在本地仓库完成提交，然后推送开发分支：

```bash
git push -u origin feature/desktop-straight-ink
```

推送会分别触发 Windows 和 Mac 构建。登录由 Git 的凭据管理器处理。Git 作者邮箱可使用 GitHub Settings → Emails 中提供的 noreply 地址。

## 下载与安装

在 [Actions](https://github.com/fg155/excalidraw/actions) 中打开对应平台的成功运行记录，进入 Summary，在 Artifacts 下载。产物保留 14 天。

| 平台 | 工作流 | 产物 |
| --- | --- | --- |
| Windows x64 | Desktop Windows preview | `Excalidraw-Personal-Windows-x64-<run>` |
| macOS ARM64 | Desktop macOS preview | `Excalidraw-Personal-macOS-arm64-<run>` |

- Windows：完整解压 ZIP，运行 `excalidraw-personal.exe`。系统需要 WebView2 Runtime。
- Mac：在 Mac 上解压 ZIP，打开 DMG，将 Excalidraw Personal.app 拖入“应用程序”。Mac 使用 ad-hoc 临时签名，未经 Apple 公证。

构建失败时查看失败步骤的日志。修正后推送新提交；重新运行旧记录仍使用旧代码。

## 更新与迁移

关闭旧应用后替换程序文件，保留应用数据目录。画板保存在所选文件夹中，设置、回收站和历史备份保存在本机。

跨设备可复制 `.excalidraw` 文件，或使用 OneDrive 等文件同步服务；设置通过导出／导入迁移，并在新设备重新选择画板目录。避免多台设备同时编辑同一文件。

详细构建命令见 [Windows 工作流](../.github/workflows/desktop-windows.yml)和 [Mac 工作流](../.github/workflows/desktop-macos.yml)。
