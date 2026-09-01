[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$Generation,

  [Parameter(Mandatory = $false)]
  [switch]$CreateBucket
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$SecureSupabaseKey = $null
$SupabaseKeyPointer = [IntPtr]::Zero
$SupabaseKeyPlainText = $null

function Invoke-NpmChecked {
  param([Parameter(Mandatory = $true)][string[]]$CommandArguments)

  & npm.cmd @CommandArguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm.cmd failed with exit code $LASTEXITCODE."
  }
}

Push-Location $Workspace
try {
  Write-Host "Preflight PREVIEW generation $Generation"
  Write-Host "This step validates only prepared local artifacts and never accepts a secret."
  Invoke-NpmChecked -CommandArguments @(
    "run", "rules:preview:preflight", "--", "--generation", $Generation.ToString()
  )

  Write-Host "Activate PREVIEW generation $Generation"
  Write-Host "This is the only operator step that writes to Supabase."
  Write-Host "Enter only the dedicated rule_catalog_preview key with sb_secret_ prefix."
  $SecureSupabaseKey = Read-Host "Supabase key rule_catalog_preview" -AsSecureString
  $SupabaseKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureSupabaseKey)
  $SupabaseKeyPlainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($SupabaseKeyPointer)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SupabaseKeyPointer)
  $SupabaseKeyPointer = [IntPtr]::Zero

  if (-not $SupabaseKeyPlainText.StartsWith("sb_secret_") -or $SupabaseKeyPlainText.Length -lt 20) {
    throw "The supplied value is not a Supabase sb_secret_ key."
  }

  $env:SUPABASE_SECRET_KEY = $SupabaseKeyPlainText
  $SupabaseKeyPlainText = $null
  $CommandArguments = @(
    "run", "rules:preview:activate", "--", "--generation", $Generation.ToString()
  )
  if ($CreateBucket) {
    $CommandArguments += "--create-bucket"
  }
  Invoke-NpmChecked -CommandArguments $CommandArguments
}
finally {
  if ($SupabaseKeyPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($SupabaseKeyPointer)
  }
  $SupabaseKeyPlainText = $null
  Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
