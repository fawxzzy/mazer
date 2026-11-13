# Runs the read-only live-preimage query pack through the read-only Supabase wrapper (sb-query.ps1) and writes one evidence
# folder: the rendered query files, the JSON each returned, SHA256SUMS.txt and EVIDENCE.txt (sha256 + md5 of every file).
#
# This script only READS. The wrapper itself refuses any file with a write/DDL/session word (see lib/sql-screen.mjs, which
# mirrors it), and every query here is lint-checked offline BEFORE the first network call.
#
# Usage:
#   powershell -NoProfile -File scripts\db-scratch\run-preimage-pack.ps1 -OutDir C:\ATLAS\tmp\<change>-preimage `
#       [-Schemas mazer,account_private] [-Function mazer.mazer_set_username] [-IncludeVolatile] [-SbQuery <path to sb-query.ps1>]
#
# -IncludeVolatile adds 90-92 (runner role, long transactions, waiting locks): run those in the minutes before an apply.
param(
  [Parameter(Mandatory)][string]$OutDir,
  [string[]]$Schemas = @(),
  [string]$Function = '',
  [switch]$IncludeVolatile,
  [string]$SbQuery = (Join-Path $env:USERPROFILE '.claude\skills\atlas-supabase\sb-query.ps1')
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$pack = Join-Path $here 'preimage-pack.mjs'
if (-not (Test-Path $SbQuery)) { throw "read-only wrapper not found: $SbQuery (pass -SbQuery)" }
if (Test-Path $OutDir) {
  if (Get-ChildItem -Force $OutDir | Select-Object -First 1) { throw "OutDir is not empty: $OutDir (one folder per capture, never overwrite evidence)" }
}

$renderArgs = @($pack, 'render', '--out', $OutDir)
if ($Schemas.Count -gt 0) { $renderArgs += @('--schemas', ($Schemas -join ',')) }
if ($Function) { $renderArgs += @('--function', $Function) }
& node @renderArgs
if ($LASTEXITCODE -ne 0) { throw 'render/lint failed: nothing was sent to the database' }

$files = Get-ChildItem $OutDir -Filter '*.sql' | Sort-Object Name
foreach ($file in $files) {
  $number = [int]$file.Name.Substring(0, 2)
  if ($number -ge 90 -and -not $IncludeVolatile) { Write-Host "skip (volatile) $($file.Name)"; continue }
  $out = Join-Path $OutDir ($file.BaseName + '.json')
  Write-Host "run  $($file.Name)"
  & powershell -NoProfile -File $SbQuery -SqlFile $file.FullName -OutFile $out | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "wrapper failed on $($file.Name) (exit $LASTEXITCODE)" }
}
& node $pack index --dir $OutDir
Write-Host "Done. Evidence: $OutDir"
Write-Host "Next: node scripts/db-scratch/preimage-pack.mjs guard-md5 --result $OutDir\02-function-body.json [--repo-file <the blob>]"
