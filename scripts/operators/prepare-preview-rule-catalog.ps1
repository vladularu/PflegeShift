[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [ValidatePattern('^rules[\\/]releases[\\/][a-z0-9][0-9A-Za-z._\\/-]*\.json$')]
  [string]$Request,

  [Parameter(Mandatory = $false)]
  [string]$ProtectedSeedPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$SeedBytes = $null
$SeedEntropy = $null
$SecureSeed = $null
$SeedPointer = [IntPtr]::Zero
$SeedPlainText = $null

function Invoke-NpmChecked {
  param([Parameter(Mandatory = $true)][string[]]$CommandArguments)

  & npm.cmd @CommandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd failed with exit code $LASTEXITCODE."
  }
}

Push-Location $Workspace
try {
  $RequestFullPath = Join-Path $Workspace $Request
  if (-not (Test-Path -LiteralPath $RequestFullPath -PathType Leaf)) {
    throw "The publication request does not exist: $Request"
  }
  $RequestFullPath = (Resolve-Path -LiteralPath $RequestFullPath).Path
  $ReleaseRoot = (Resolve-Path -LiteralPath (Join-Path $Workspace "rules\releases")).Path
  $ReleasePrefix = $ReleaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $RequestFullPath.StartsWith($ReleasePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "The publication request must stay below rules/releases/."
  }
  $RequestValue = Get-Content -LiteralPath $RequestFullPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $KeyId = [string]$RequestValue.signing.keyId
  if ($KeyId -notmatch '^preview-[a-z0-9]+(?:[.-][a-z0-9]+)*$') {
    throw "The publication request does not contain a valid Preview signing key id."
  }

  if ([string]::IsNullOrWhiteSpace($ProtectedSeedPath)) {
    $ProtectedSeedPath = Join-Path $env:LOCALAPPDATA "PflegeShift\secrets\rule-catalog-$KeyId.dpapi"
  }

  Write-Host "Prepare PREVIEW generation $($RequestValue.generation) with key $KeyId"
  Write-Host "This step performs public reads and local writes only."

  if (Test-Path -LiteralPath $ProtectedSeedPath -PathType Leaf) {
    Add-Type -AssemblyName System.Security
    $ProtectedSeed = [IO.File]::ReadAllBytes($ProtectedSeedPath)
    try {
      $SeedEntropy = [Text.Encoding]::UTF8.GetBytes("PflegeShift rule catalog $KeyId")
      $SeedBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $ProtectedSeed,
        $SeedEntropy,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
      )
    }
    finally {
      [Array]::Clear($ProtectedSeed, 0, $ProtectedSeed.Length)
    }
    if ($SeedBytes.Length -ne 32) {
      throw "The DPAPI-protected signing seed does not contain exactly 32 bytes."
    }
    $SeedPlainText = [Convert]::ToBase64String($SeedBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
    Write-Host "The DPAPI-protected seed was loaded for the current Windows account."
  }
  else {
    Write-Host "No DPAPI seed was found at $ProtectedSeedPath"
    $SecureSeed = Read-Host "Signing seed for $KeyId (43-character base64url)" -AsSecureString
    $SeedPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureSeed)
    $SeedPlainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SeedPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SeedPointer)
    $SeedPointer = [IntPtr]::Zero
  }

  if ($SeedPlainText -notmatch '^[A-Za-z0-9_-]{43}$') {
    throw "The signing seed must be a 43-character unpadded base64url value."
  }

  $env:RULE_CATALOG_SIGNING_KEY_BASE64URL = $SeedPlainText
  $SeedPlainText = $null
  Invoke-NpmChecked -CommandArguments @(
    "run", "rules:preview:prepare", "--", "--request", $Request
  )
}
finally {
  if ($SeedPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SeedPointer)
  }
  $SeedPlainText = $null
  Remove-Item Env:RULE_CATALOG_SIGNING_KEY_BASE64URL -ErrorAction SilentlyContinue
  if ($null -ne $SeedBytes) {
    [Array]::Clear($SeedBytes, 0, $SeedBytes.Length)
  }
  if ($null -ne $SeedEntropy) {
    [Array]::Clear($SeedEntropy, 0, $SeedEntropy.Length)
  }
  Pop-Location
}
