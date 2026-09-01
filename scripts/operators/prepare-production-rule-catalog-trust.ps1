[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$KeyId = "production-2026-r1"
$SeedEnvironmentName = "RULE_CATALOG_SIGNING_KEY_BASE64URL"
$ProtectedSeedDirectory = $null
$ProtectedSeedPath = $null
$SeedBytes = $null
$RoundTripSeedBytes = $null
$ProtectedSeedBytes = $null
$SeedEntropy = $null
$RandomNumberGenerator = $null

function Invoke-NpmJsonChecked {
  param([Parameter(Mandatory = $true)][string[]]$CommandArguments)

  $Output = @(& npm.cmd @CommandArguments 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd failed with exit code $LASTEXITCODE."
  }
  $ResultLine = $Output |
    Where-Object { [string]$_ -like "PRODUCTION_TRUST_RESULT *" } |
    Select-Object -Last 1
  if ($null -eq $ResultLine) {
    throw "The Production trust operator returned no machine-readable result."
  }
  $Json = ([string]$ResultLine).Substring("PRODUCTION_TRUST_RESULT ".Length)
  return $Json | ConvertFrom-Json
}

function ConvertTo-Base64Url {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Invoke-PublicKeyDerivation {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $LocalSeedText = ConvertTo-Base64Url -Bytes $Bytes
  try {
    $env:RULE_CATALOG_SIGNING_KEY_BASE64URL = $LocalSeedText
    $Result = Invoke-NpmJsonChecked -CommandArguments @(
      "run", "rules:production:trust", "--", "derive"
    )
    if ($Result.status -ne "PUBLIC_KEY_DERIVED" -or $Result.keyId -ne $KeyId) {
      throw "The Production trust operator returned an unexpected derivation result."
    }
    return $Result
  }
  finally {
    $LocalSeedText = $null
    Remove-Item Env:RULE_CATALOG_SIGNING_KEY_BASE64URL -ErrorAction SilentlyContinue
  }
}

function Test-EqualBytes {
  param(
    [Parameter(Mandatory = $true)][byte[]]$Left,
    [Parameter(Mandatory = $true)][byte[]]$Right
  )

  if ($Left.Length -ne $Right.Length) {
    return $false
  }
  for ($Index = 0; $Index -lt $Left.Length; $Index += 1) {
    if ($Left[$Index] -ne $Right[$Index]) {
      return $false
    }
  }
  return $true
}

Push-Location $Workspace
try {
  Write-Host "Preflight Production trust preparation for $KeyId"
  Write-Host "This step reads only the committed disabled contract and never accepts a secret."
  $Preflight = Invoke-NpmJsonChecked -CommandArguments @(
    "run", "rules:production:trust", "--", "preflight"
  )
  if ($Preflight.status -ne "READY_TO_PREPARE" -or $Preflight.keyId -ne $KeyId) {
    throw "Production trust preparation is not ready."
  }

  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw "LOCALAPPDATA is required for the DPAPI-protected operator store."
  }
  $ProtectedSeedDirectory = Join-Path $env:LOCALAPPDATA "PflegeShift\secrets"
  $ProtectedSeedPath = Join-Path $ProtectedSeedDirectory "rule-catalog-$KeyId.dpapi"

  Add-Type -AssemblyName System.Security
  $SeedEntropy = [Text.Encoding]::UTF8.GetBytes("PflegeShift rule catalog $KeyId")

  if (Test-Path -LiteralPath $ProtectedSeedPath -PathType Leaf) {
    $ProtectedSeedBytes = [IO.File]::ReadAllBytes($ProtectedSeedPath)
    $SeedBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      $ProtectedSeedBytes,
      $SeedEntropy,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    if ($SeedBytes.Length -ne 32) {
      throw "The DPAPI-protected Production signing seed does not contain exactly 32 bytes."
    }
    $PublicResult = Invoke-PublicKeyDerivation -Bytes $SeedBytes
    Write-Host "The existing DPAPI-protected Production seed was verified without overwriting it."
  }
  else {
    $SeedBytes = New-Object byte[] 32
    $RandomNumberGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    $RandomNumberGenerator.GetBytes($SeedBytes)

    $ProtectedSeedBytes = [Security.Cryptography.ProtectedData]::Protect(
      $SeedBytes,
      $SeedEntropy,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $RoundTripSeedBytes = [Security.Cryptography.ProtectedData]::Unprotect(
      $ProtectedSeedBytes,
      $SeedEntropy,
      [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    if (-not (Test-EqualBytes -Left $SeedBytes -Right $RoundTripSeedBytes)) {
      throw "The DPAPI round-trip changed the Production signing seed."
    }

    $FirstPublicResult = Invoke-PublicKeyDerivation -Bytes $SeedBytes
    $RoundTripPublicResult = Invoke-PublicKeyDerivation -Bytes $RoundTripSeedBytes
    if ($FirstPublicResult.publicKeyBase64Url -ne $RoundTripPublicResult.publicKeyBase64Url) {
      throw "The DPAPI round-trip changed the derived Production public key."
    }

    [IO.Directory]::CreateDirectory($ProtectedSeedDirectory) | Out-Null
    $Stream = [IO.File]::Open(
      $ProtectedSeedPath,
      [IO.FileMode]::CreateNew,
      [IO.FileAccess]::Write,
      [IO.FileShare]::None
    )
    try {
      $Stream.Write($ProtectedSeedBytes, 0, $ProtectedSeedBytes.Length)
      $Stream.Flush($true)
    }
    finally {
      $Stream.Dispose()
    }
    $PublicResult = $FirstPublicResult
    Write-Host "A new DPAPI-protected Production seed was created for the current Windows user."
  }

  Write-Host "Protected store: $ProtectedSeedPath"
  Write-Output ($PublicResult | ConvertTo-Json -Compress)
}
finally {
  Remove-Item Env:RULE_CATALOG_SIGNING_KEY_BASE64URL -ErrorAction SilentlyContinue
  if ($null -ne $SeedBytes) {
    [Array]::Clear($SeedBytes, 0, $SeedBytes.Length)
  }
  if ($null -ne $RoundTripSeedBytes) {
    [Array]::Clear($RoundTripSeedBytes, 0, $RoundTripSeedBytes.Length)
  }
  if ($null -ne $ProtectedSeedBytes) {
    [Array]::Clear($ProtectedSeedBytes, 0, $ProtectedSeedBytes.Length)
  }
  if ($null -ne $SeedEntropy) {
    [Array]::Clear($SeedEntropy, 0, $SeedEntropy.Length)
  }
  if ($null -ne $RandomNumberGenerator) {
    $RandomNumberGenerator.Dispose()
  }
  Pop-Location
}
