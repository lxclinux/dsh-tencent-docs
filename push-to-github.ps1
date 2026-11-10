# 把本地 commit 推到 GitHub：lxclinux/dsh-tencent-docs
# 用法：在本文件所在目录执行  .\push-to-github.ps1
# 说明：本机 TLS 缺根证书，脚本对该仓库关闭校验（git config http.sslVerify false，换机器删掉）
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$repo = 'https://github.com/lxclinux/dsh-tencent-docs.git'

Write-Host "1/3 检查远端仓库（GitHub 慢，等 10-60 秒）..." -ForegroundColor Cyan
& git -c http.sslVerify=false ls-remote $repo 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "   读不到远端：仓库还没建，或者是 Private。去 https://github.com/new 建 Public 的 dsh-tencent-docs（不要勾 README）。" -ForegroundColor Yellow
  exit 1
}
Write-Host "   远端可访问" -ForegroundColor Green

Write-Host "2/3 绑定 origin..." -ForegroundColor Cyan
& git remote remove origin 2>$null | Out-Null
& git remote add origin $repo
& git config http.sslVerify false
& git remote -v

Write-Host "3/3 推 main..." -ForegroundColor Cyan
& git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "   推送失败。多半是凭据：Username 填 lxclinux，Password 填 Personal Access Token（勾 repo 权限）。" -ForegroundColor Yellow
  Write-Host "   已有 GCM 弹窗时，在弹窗里登录 GitHub 即可。" -ForegroundColor DarkGray
  exit 1
}
Write-Host "推送完成：https://github.com/lxclinux/dsh-tencent-docs" -ForegroundColor Green
Write-Host "接着做两件手工事：仓库 About 齿轮里的 Topics 填 dsh-plugin；然后跑 .\publish-npm.ps1" -ForegroundColor Cyan
