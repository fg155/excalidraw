$ErrorActionPreference = 'Stop'

# Paths are based on this checked-in script, never on the caller's working directory.
$desktopRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $desktopRoot
$buildRoot = Join-Path $desktopRoot 'src-tauri/target/x86_64-pc-windows-msvc/release'
$executable = Join-Path $buildRoot 'excalidraw-personal.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Native executable was not produced: $executable"
}

$packageRoot = Join-Path $desktopRoot 'artifacts/Excalidraw-Personal-Windows-x64'
# Refuse to mix stale binaries from a previous local run into a new package.
if (Test-Path -LiteralPath $packageRoot) {
    throw "Package destination already exists. Move the previous package aside before rerunning: $packageRoot"
}
New-Item -ItemType Directory -Path $packageRoot | Out-Null
Copy-Item -LiteralPath $executable -Destination $packageRoot
Get-ChildItem -LiteralPath $buildRoot -Filter '*.dll' -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $packageRoot
}
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'LICENSE') -Destination (Join-Path $packageRoot 'LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $desktopRoot 'WINDOWS-PREVIEW.zh-CN.txt') -Destination (Join-Path $packageRoot 'README.zh-CN.txt')

# Upstream font copyright/license texts are embedded in family index.ts comments.
# Preserve those verbatim, alongside any standalone license files.
$fontsRoot = Join-Path $repositoryRoot 'packages/excalidraw/fonts'
Get-ChildItem -LiteralPath $fontsRoot -Recurse -File | Where-Object {
    $_.Name -eq 'index.ts' -or $_.Name -match '^(LICENSE|OFL|NOTICE|COPYING)(\..*)?$'
} | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath($fontsRoot, $_.FullName)
    $destination = Join-Path $packageRoot (Join-Path 'licenses/fonts' $relative)
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination
}

Write-Output "Portable preview staged at $packageRoot"
Get-FileHash -LiteralPath (Join-Path $packageRoot 'excalidraw-personal.exe') -Algorithm SHA256
