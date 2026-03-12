$desktop = [Environment]::GetFolderPath('Desktop')
$sourceFolder = Join-Path $desktop 'ChessPartyLAN'
$zipPath = Join-Path $desktop 'ChessPartyLAN.zip'

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $sourceFolder '*') -DestinationPath $zipPath -Force
