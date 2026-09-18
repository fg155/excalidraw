# 第一次用 GitHub 构建 Windows 预览版

目前只是准备好了构建配置，**尚未在 GitHub 执行，也尚未得到 exe**。第一轮原生编译可能暴露需要继续修正的问题。请先测试 Windows，Mac 打包后续再接。

## 1. 开启你自己仓库的 Actions

登录 GitHub，打开 [fg155/excalidraw 的 Actions 页面](https://github.com/fg155/excalidraw/actions)。如果页面提示 fork 的工作流未启用，点击确认启用（通常为 “I understand my workflows, go ahead and enable them”）。如果已经显示工作流列表，可以跳过。

无需创建 Release、配置发布密钥或把开发分支合并到 master。新工作流只需要读取代码并上传构建产物；不要求把仓库权限改为读写。

## 2. 完成本地提交

先告诉助手你希望使用的 Git 提交姓名和邮箱，由助手完成本地提交；**不要提供密码或访问令牌**。

建议从 [GitHub Settings → Emails](https://github.com/settings/emails) 复制 GitHub 显示的 noreply 隐私邮箱。不要自行猜测邮箱格式。姓名和邮箱会进入公开的 Git 提交记录。

等助手明确告诉你“本地提交已完成”再推送。`git push` 不会上传未提交的修改。目前源码位于：

```text
C:\Users\fg155\Documents\Codex\2026-09-18\xi\outputs\excalidraw
```

## 3. 手动推送开发分支

在 Windows PowerShell 中运行以下命令。它使用已下载到工作区的便携 Git，不需要另装 Git，也不修改系统 PATH：

```powershell
$repo = 'C:\Users\fg155\Documents\Codex\2026-09-18\xi\outputs\excalidraw'
$portableGit = 'C:\Users\fg155\Documents\Codex\2026-09-18\xi\work\mingit'
& "$portableGit\cmd\git.exe" "--exec-path=$portableGit\mingw64\bin" -c "safe.directory=$repo" -C $repo -c http.sslBackend=openssl push -u origin feature/desktop-straight-ink
```

这会把已提交的代码推到你自己的 `fg155/excalidraw` 仓库的开发分支，同时触发 Windows 构建。不会推到官方仓库，不会覆盖 master，不会发布正式 Release。

`safe.directory` 只在这一次命令中信任该目录，用于处理隔离环境创建仓库与本机用户不同的所有权检查；不修改全局 Git 设置。

如果首次推送弹出 GitHub 登录，请由你自己完成。如果出现权限、认证或网络错误，把错误文字发给助手；不要把密码、令牌或带有凭证的 URL 发到聊天里，不要为了推送关闭 TLS 证书校验，也不要使用强制推送。

## 4. 等待构建，下载 ZIP

回到 [Actions 页面](https://github.com/fg155/excalidraw/actions)，寻找 **Desktop Windows preview** 的最新记录。它会安装云端工具、运行相关测试、编译完整的原生程序，然后上传文件。

- 绿色成功：在该次记录下方的 **Artifacts** 中下载 `Excalidraw-Personal-Windows-x64-数字`。本配置保留产物 14 天；下载后请自行留存。
- 红色失败：打开失败的步骤，将最后的错误日志或该次运行的链接发给助手。修正代码、再次提交推送后会自动重试。
- 完全没有记录：确认先启用了 Actions、推送的是 `feature/desktop-straight-ink` 分支，而且提交确实包含 `.github/workflows/desktop-windows.yml`。先把页面情况发给助手，不要为此合并到主分支。

第一轮无需点击 “Run workflow”：本配置会在开发分支推送后自动运行。GitHub 的手动运行按钮通常要求工作流文件已存在于默认分支，因此初期没有按钮是正常情况。[GitHub 官方说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 5. 首次运行

把 ZIP **完整解压**，再双击 `excalidraw-personal.exe`；若有 DLL，请保留同目录。先选择一个新的测试文件夹，不要选择重要画布的唯一副本。

你的 Windows 已检测到 WebView2 Runtime。运行程序不需要安装云端所用的 Rust、Node 或 C++ 编译工具。预览版未做商业代码签名，系统可能提示未知发布者；请核对来源，不要关闭系统防护。

建议先测：新建画布 → 绘图 → 等待“已保存到本机” → 关闭重开 → 检查画布和设置。之后再测试 Shift 拉直、停顿拉直、撤销、插入图片、重命名及删除后恢复。

这仍是开发预览，不是正式发布。首次成功编译后，还需要原生窗口、离线字体、手写笔和 OneDrive 的实际验证。

## 后续重复构建

本地修正、提交后，继续推送同一个开发分支即可。正在运行的同分支旧任务会被新任务取消，避免重复构建；不会自动更新你电脑上正在使用的应用。

本方案遵循 [Tauri 的 GitHub 构建说明](https://v2.tauri.app/distribute/pipelines/github/)，但只上传测试用 Artifact，不创建 Release 或自动发布。
