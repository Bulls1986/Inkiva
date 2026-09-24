param(
  [string]$ArtifactDirectory = 'dist'
)

$ErrorActionPreference = 'Stop'
$directory = (Resolve-Path $ArtifactDirectory).Path
$installer = Get-ChildItem -Path $directory -Filter '*-setup.exe' | Select-Object -First 1
$zip = Get-ChildItem -Path $directory -Filter '*.zip' | Select-Object -First 1
if (-not $installer) { throw 'Windows package smoke: setup.exe artifact not found' }
if (-not $zip) { throw 'Windows package smoke: zip artifact not found' }

$installDir = Join-Path $env:RUNNER_TEMP 'inkiva-install-smoke'
$zipDir = Join-Path $env:RUNNER_TEMP 'inkiva-zip-smoke'
Remove-Item $installDir, $zipDir -Recurse -Force -ErrorAction SilentlyContinue

try {
  $process = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "Windows installer exited with code $($process.ExitCode)" }

  $installedExe = Join-Path $installDir 'inkiva.exe'
  if (-not (Test-Path $installedExe)) {
    throw "Windows installer smoke did not produce $installedExe"
  }

  Expand-Archive -Path $zip.FullName -DestinationPath $zipDir -Force
  $zipExe = Get-ChildItem -Path $zipDir -Filter 'inkiva.exe' -Recurse | Select-Object -First 1
  if (-not $zipExe) { throw 'Windows ZIP smoke did not contain inkiva.exe' }

  Write-Output "Verified Windows installer and ZIP from $directory"
} finally {
  Remove-Item $installDir, $zipDir -Recurse -Force -ErrorAction SilentlyContinue
}
