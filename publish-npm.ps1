# 一键发布到 npm（只需你在浏览器里授权一次）
# 本机 TLS 链缺根证书：npm 走 node，需 strict-ssl=false 才能连 registry.npmjs.org
$ErrorActionPreference = 'Stop'
$reg = 'https://registry.npmjs.org'
$env:npm_config_strict_ssl = 'false'

Write-Host "1/3 检查登录状态..." -ForegroundColor Cyan
$who = & npm whoami --registry=$reg 2>$null
if ($LASTEXITCODE -ne 0 -or -not $who) {
  Write-Host "未登录，打开浏览器授权（登录后自动继续）..." -ForegroundColor Yellow
  & npm login --registry=$reg --strict-ssl=false
}
Write-Host ("   当前账号: " + (& npm whoami --registry=$reg)) -ForegroundColor Green

Write-Host "2/3 检查包名是否被占用..." -ForegroundColor Cyan
& npm view dsh-tencent-docs version --registry=$reg 2>$null
if ($LASTEXITCODE -eq 0) { Write-Host "   警告：npm 上已存在同名包，发布会失败，需要改 name" -ForegroundColor Yellow }
else { Write-Host "   包名可用" -ForegroundColor Green }

Write-Host "3/3 发布..." -ForegroundColor Cyan
& npm publish --access public --registry=$reg --strict-ssl=false
if ($LASTEXITCODE -eq 0) {
  Write-Host "发布成功：https://www.npmjs.com/package/dsh-tencent-docs" -ForegroundColor Green
  Write-Host "安装命令：dsh plugin --profile desktop add dsh-tencent-docs" -ForegroundColor Green
  Write-Host "别忘了只发一次：改版本号后再跑本脚本才会覆盖" -ForegroundColor DarkGray
} else {
  Write-Host "发布失败，看上面的 npm error" -ForegroundColor Red
}
