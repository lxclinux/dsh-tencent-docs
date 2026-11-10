# 把本地 7 个 commit 推到 GitHub：lxclinux/dsh-tencent-docs
# 用法：仓库建好后在本文件所在目录执行  .\push-to-github.ps1
$ErrorActionPreference = 'Stop'
$repo = 'https://github.com/lxclinux/dsh-tencent-docs.git'

Write-Host "1/3 检查远端仓库是否存在..." -ForegroundColor Cyan
$ls = & git -c http.sslVerify=false ls-remote $repo 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $ls -ForegroundColor DarkGray
  Write-Host "仓库还不在（或同名但为空）。先去 https://github.com/new 建 Public 仓库 dsh-tencent-docs，不要勾 README。" -ForegroundColor Yellow
  exit 1
}
Write-Host "   远端可访问" -ForegroundColor Green

Write-Host "2/3 绑定 origin..." -ForegroundColor Cyan
& git remote remove origin 2>$null
& git remote add origin $repo
# 本机 TLS 缺根证书，只对本仓库关校验；换机器后删掉这行
& git config http.sslVerify false
& git remote -v

Write-Host "3/3 推送 main..." -ForegroundColor Cyan
& git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "推送失败：多半是没有凭据。密码处填 GitHub Personal Access Token（repo 权限），不是账号密码。" -ForegroundColor Yellow
  exit 1
}
Write-Host "推送完成：https://github.com/lxclinux/dsh-tencent-docs" -ForegroundColor Green
Write-Host "剩两件手工事：仓库 About → Topics 填 dsh-plugin；然后跑 .\publish-npm.ps1" -ForegroundColor Cyan
