# build.ps1 - Windows PowerShell Build and Packaging for SweetClocker Module
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "==> Building WebUI with TypeScript & Vite..." -ForegroundColor Cyan
& npm.cmd run build

if (!(Test-Path "webroot\index.html") -or !(Test-Path "webroot\assets")) {
    Write-Error "webroot build artifacts missing!"
}

$moduleProp = Get-Content "module.prop" | Out-String
if ($moduleProp -match "version=(.+)") {
    $ver = $matches[1].Trim()
} else {
    $ver = "1.5.0"
}
$zipName = "SweetClocker-$ver.zip"

Write-Host "==> Packaging $zipName using bsdtar..." -ForegroundColor Cyan
if (Test-Path $zipName) {
    Remove-Item $zipName -Force
}

& tar.exe -a -c -f $zipName `
  module.prop `
  service.sh `
  post-fs-data.sh `
  customize.sh `
  hotinstall.sh `
  uninstall.sh `
  sweetspot-apply.sh `
  telemetry.sh `
  webroot `
  changelog.md `
  update.json

Write-Host "==> Flashable module package ready: $zipName" -ForegroundColor Green
Get-Item $zipName | Select-Object Name, Length, LastWriteTime
