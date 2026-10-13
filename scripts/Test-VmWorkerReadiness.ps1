#Requires -Version 5.1
<#
.SYNOPSIS
Read-only commissioning preflight for the restricted WebCoRE VM worker.
.DESCRIPTION
Never installs, restarts, changes ACLs, or executes worker operations.
Returns nonzero until mandatory isolation prerequisites are satisfied.
#>
[CmdletBinding()]
param(
  [string]$ReleaseRoot = 'C:\SmartHome\webcore-CLI',
  [string]$NodePath = 'C:\Program Files\nodejs\node.exe',
  [string]$WorkerTaskName = 'SmartHome-WebCoRE-Worker'
)
$ErrorActionPreference = 'Stop'
$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $checks.Add([pscustomobject]@{ Check=$Name; Passed=$Passed; Detail=$Detail })
}
try {
  Add-Check 'Windows platform' ($env:OS -eq 'Windows_NT') 'Worker is Windows-only'
  Add-Check 'Release checkout' (Test-Path -LiteralPath (Join-Path $ReleaseRoot 'package.json') -PathType Leaf) $ReleaseRoot
  Add-Check 'Pinned Node executable' (Test-Path -LiteralPath $NodePath -PathType Leaf) $NodePath
  $task = Get-ScheduledTask -TaskName $WorkerTaskName -ErrorAction SilentlyContinue
  Add-Check 'Dedicated worker task installed' ($null -ne $task) $WorkerTaskName
  if ($null -ne $task) {
    Add-Check 'Worker not running as SYSTEM' ($task.Principal.UserId -notin @('SYSTEM','NT AUTHORITY\SYSTEM','S-1-5-18')) ([string]$task.Principal.UserId)
  } else {
    Add-Check 'Worker not running as SYSTEM' $false 'No worker identity to inspect'
  }
  # These controls must be independently attested, not inferred from file existence.
  Add-Check 'Job Object process-tree containment' $false 'Requires independently verified implementation and tests'
  Add-Check 'Named pipe DACL and peer verification' $false 'Transport is intentionally disabled'
  Add-Check 'Independent trusted approval issuance' $false 'Approval ledger has no commissioned issuer'
  Add-Check 'Protected immutable release and audit ACLs' $false 'Requires explicit ACL verification'
  $checks | Format-Table -AutoSize | Out-String | Write-Output
  if ($checks.Where({ -not $_.Passed }).Count -gt 0) {
    Write-Warning 'NOT READY: no production installation or activation authorized by this preflight.'
    exit 2
  }
} catch {
  Write-Error ('Preflight failed closed: ' + $_.Exception.Message)
  exit 2
}
