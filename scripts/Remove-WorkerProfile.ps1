#Requires -Version 5.1
#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$root='C:\ProgramData\SmartHome\VmManagement'
$pending=Join-Path $root 'recovery\profile-cleanup.json'
$record=Get-Content -LiteralPath $pending -Raw|ConvertFrom-Json
$sid=([Security.Principal.SecurityIdentifier]::new([string]$record.Sid)).Value
$profile=Get-CimInstance Win32_UserProfile -Filter "SID='$sid'"
if($null -ne $profile -and $profile.Loaded){throw 'Profile still loaded; retain the protected cleanup request for next startup'}
if($null -ne $profile){$profile|Remove-CimInstance}
Remove-Item -LiteralPath $pending
Unregister-ScheduledTask -TaskName 'SmartHome-WebCoRE-ProfileCleanup' -Confirm:$false -ErrorAction SilentlyContinue
# The verified script remains protected recovery inventory; never remove active payloads here.
