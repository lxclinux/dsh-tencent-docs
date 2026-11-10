# 发布到 npm。账号开了 2FA，必须二选一：
#   A) 用带 Bypass 2FA 的 Granular Access Token：.\publish-npm.ps1 -Token ghp_xxx
#   B) 用认证器里的 6 位码：.\publish-npm.ps1 -Otp 123456
#   C) 账号 2FA 是安全密钥（Windows Hello）：.\publish-npm.ps1 -WebAuth
param(
  [string]$Token,
  [string]$Otp,
  [switch]$WebAuth
)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$reg = 'https://registry.npmjs.org'
$env:npm_config_strict_ssl = 'false'

function Fail($msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

Write-Host "1/4 凭据检查..." -ForegroundColor Cyan
if ($Token) {
  if ($Token -notmatch '^npm_') { Write-Host "   提示：Granular Token 一般以 npm_ 开头，确认没粘错" -ForegroundColor Yellow }
  & npm config set "//registry.npmjs.org/:_authToken" $Token --location=user 2>$null
  Write-Host "   已写入 user 级 .npmrc 的 _authToken" -ForegroundColor Green
} else {
  Write-Host "   未提供 -Token，沿用已有登录态" -ForegroundColor DarkGray
}
$who = (& npm whoami --registry=$reg 2>$null | Out-String).Trim()
Write-Host ("   当前账号: " + ($(if ($who) { $who } else { '(未登录)' }))) -ForegroundColor Green

Write-Host "2/4 包名与版本..." -ForegroundColor Cyan
$pkg = (& node -e "const p=require('./package.json');console.log(p.name+' '+p.version)" | Out-String).Trim()
Write-Host "   本地: $pkg"
& npm view dsh-tencent-docs version --registry=$reg 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  $remote = (& npm view dsh-tencent-docs version --registry=$reg 2>$null | Out-String).Trim()
  Write-Host "   远端已存在，最新版本: $remote（同版本发布会 403，需要先改 version）" -ForegroundColor Yellow
} else {
  Write-Host "   包名可用" -ForegroundColor Green
}

Write-Host "3/4 发布..." -ForegroundColor Cyan
$publishArgs = @('publish', '--access', 'public', "--registry=$reg", '--strict-ssl=false')
if ($Otp) { $publishArgs += "--otp=$Otp" }
if ($WebAuth) { $publishArgs += '--auth-type=web' }
& npm @publishArgs
$code = $LASTEXITCODE

Write-Host "4/4 结果..." -ForegroundColor Cyan
if ($code -eq 0) {
  Write-Host "   发布成功：https://www.npmjs.com/package/dsh-tencent-docs" -ForegroundColor Green
  Write-Host "   装到本机：dsh plugin --profile desktop add dsh-tencent-docs" -ForegroundColor Green
} else {
  Write-Host "   失败退出码 $code" -ForegroundColor Red
  Write-Host "   403 + 'Two-factor authentication ... required' = 令牌没开 Bypass 2FA，或没传 -Otp" -ForegroundColor Yellow
  Write-Host "   402/403 payment = 账号需要补账单信息或域名未被允许" -ForegroundColor Yellow
  Write-Host "   E409/E403 already exists = 该版本号已发布，改 package.json 的 version" -ForegroundColor Yellow
  exit $code
}
