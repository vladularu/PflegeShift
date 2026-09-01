[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$Generation
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path

Push-Location $Workspace
try {
  Write-Host "Recover public PREVIEW generation $Generation"
  Write-Host "This step performs public reads and local writes only and does not require a secret."
  & npm.cmd run rules:preview:recover -- --generation $Generation.ToString()
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd failed with exit code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
