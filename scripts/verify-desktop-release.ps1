$desktop = [Environment]::GetFolderPath('Desktop')
$root = Join-Path $desktop 'ChessPartyLAN'
$stdout = Join-Path $root 'server-stdout.log'
$stderr = Join-Path $root 'server-stderr.log'

if (Test-Path $stdout) { Remove-Item $stdout -Force }
if (Test-Path $stderr) { Remove-Item $stderr -Force }

$env:NODE_ENV = 'production'
$env:STATIC_DIR = Join-Path $root 'www'
$env:PORT = '3022'
$env:NO_OPEN_BROWSER = '1'

$proc = Start-Process -FilePath (Join-Path $root 'node\node.exe') `
  -ArgumentList (Join-Path $root 'server\index.cjs') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -PassThru

Start-Sleep -Seconds 2
$running = -not $proc.HasExited
if ($running) {
  Stop-Process -Id $proc.Id -Force
}

Write-Output "RUNNING=$running"
if (Test-Path $stdout) {
  Get-Content $stdout
}
if (Test-Path $stderr) {
  Get-Content $stderr
}
