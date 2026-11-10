# 一键发布到 npm（浏览器授权一次）
# 本机 TLS 链缺根证书，npm 走 node，需要 strict-ssl=false 才能连 registry.npmjs.org
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$reg = 'https://registry.npmjs.org'
$env:npm_config_strict_ssl = 'false'

Write-Host "1/3 检查登录状态..." -ForegroundColor Cyan
$who = (& npm whoami --registry=$reg 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $who) {
  Write-Host "   未登录，打开浏览器授权（登录完自动继续）..." -ForegroundColor Yellow
  & npm login --registry=$reg --strict-ssl=false
  $who = (& npm whoami --registry=$reg 2>$null | Out-String).Trim()
}
if (-not $who) { Write-Host "   仍未登录，先手动执行：npm login --registry=$reg" -ForegroundColor Red; exit 1 }
Write-Host ("   当前账号: " + $who) -ForegroundColor Green

Write-Host "2/3 检查包名..." -ForegroundColor Cyan
& npm view dsh-tencent-docs version --registry=$reg 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Host "   注意：npm 上已有同名包，发布会失败（需要先改 name）" -ForegroundColor Yellow }
else { Write-Host "   包名可用" -ForegroundColor Green }

Write-Host "3/3 发布..." -ForegroundColor Cyan
& npm publish --access public --registry=$reg --strict-ssl=false
if ($LASTEXITCODE -eq 0) {
  Write-Host "发布成功：https://www.npmjs.com/package/dsh-tencent-docs" -ForegroundColor Green
  Write-Host "装到本机：dsh plugin --profile desktop add dsh-tencent-docs" -ForegroundColor Green
} else {
  Write-Host "发布失败，看上面的 npm error；版本号已存在就先改 package.json 的 version" -ForegroundColor Red
}
