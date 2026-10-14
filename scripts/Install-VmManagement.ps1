#Requires -Version 5.1
#Requires -RunAsAdministrator
[CmdletBinding()]
param(
 [ValidateSet('Preflight','HardenRuntime','Install','Verify','Recover','Uninstall')][string]$Mode='Preflight',
 [string]$PackageRoot=(Split-Path $PSScriptRoot -Parent),
 [string]$TunnelConfigPath,
 [string]$NodePath='C:\Program Files\nodejs\node.exe',
 [string]$Root='C:\ProgramData\SmartHome\VmManagement',
 [switch]$Activate
)
$ErrorActionPreference='Stop'
$PackageRoot=[IO.Path]::GetFullPath($PackageRoot)
Set-StrictMode -Version Latest
$Utf8=[Text.UTF8Encoding]::new($false)
$WorkerName='SmartHomeVmWorker'
$ApprovalShortcut=Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'Smart Home VM Approval.lnk'
$BrokerTask='SmartHome-WebCoRE-Management'
$WorkerTask='SmartHome-WebCoRE-Worker'
$FirewallName='SmartHome-WebCoRE-Worker-NetworkDeny'
function Write-Json($Path,$Value){[IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 12),$Utf8)}
function Hash($Path){(Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()}
function Text-Hash([string]$Text){$sha=[Security.Cryptography.SHA256]::Create();try{[BitConverter]::ToString($sha.ComputeHash($Utf8.GetBytes($Text))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function Assert-NoReparse([string]$Path){$cursor=[IO.Path]::GetFullPath($Path);while($cursor){$item=Get-Item -LiteralPath $cursor -Force;if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'Reparse point rejected'};$cursor=[IO.Path]::GetDirectoryName($cursor)}}
function Protect([string]$Path,[string]$ReaderSid,[switch]$Writable){
 Assert-NoReparse $Path
 $directory=Test-Path -LiteralPath $Path -PathType Container
 $acl=if($directory){[Security.AccessControl.DirectorySecurity]::new()}else{[Security.AccessControl.FileSecurity]::new()}
 $acl.SetAccessRuleProtection($true,$false)
 $acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
 $inherit=if($directory){[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'}else{[Security.AccessControl.InheritanceFlags]::None}
 foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl',$inherit,'None','Allow'))}
 if($ReaderSid){$rights=if($Writable){'Modify'}else{'ReadAndExecute'};$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($ReaderSid),$rights,$inherit,'None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-Protected([string]$Path,[string]$ReaderSid){
 Assert-NoReparse $Path
 $acl=Get-Acl -LiteralPath $Path
 $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
 if($owner -notin @('S-1-5-18','S-1-5-32-544')){throw 'Untrusted file owner'}
 $write=([int][Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership') -bor 1073741824 -bor 268435456
 foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){$sid=$ace.IdentityReference.Value;if($ace.AccessControlType -eq 'Allow' -and $sid -notin @('S-1-5-18','S-1-5-32-544')){if(($ace.FileSystemRights -band $write)-ne 0 -or ($ReaderSid -and $sid -ne $ReaderSid)){throw ('Unprotected management input: '+$Path)}}}
}
function Assert-ImmutableParents([string]$Path){
 $cursor=[IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($Path))
 $installerSid='S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'
 $trusted=@('S-1-5-18','S-1-5-32-544',$installerSid)
 $danger=([int][Security.AccessControl.FileSystemRights]'Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership') -bor 268435456
 while($cursor){$acl=Get-Acl -LiteralPath $cursor;$owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;if($owner -notin $trusted){throw 'Untrusted ancestor ownership'}
  foreach($ace in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){if(($ace.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly)-ne 0){continue};$sid=$ace.IdentityReference.Value;if($ace.AccessControlType -eq 'Allow' -and $sid -notin $trusted -and ($ace.FileSystemRights -band $danger)-ne 0){throw 'Mutable ancestor permits protected-source replacement'}}
  $cursor=[IO.Path]::GetDirectoryName($cursor)
 }
}
function Harden-Runtime([string]$RuntimeRoot,[string]$TunnelExecutable){
 if(-not $RuntimeRoot.StartsWith('C:\SmartHome\',[StringComparison]::OrdinalIgnoreCase) -or -not $TunnelExecutable.StartsWith('C:\SmartHome\',[StringComparison]::OrdinalIgnoreCase)){throw 'Hardening scope requires existing C:\SmartHome runtime'}
 $trusted=@('S-1-5-18','S-1-5-32-544')
 $write=([int][Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership') -bor 1073741824 -bor 268435456
 $danger=([int][Security.AccessControl.FileSystemRights]'Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership') -bor 268435456
 $scope=@($RuntimeRoot)+@(Get-ChildItem -LiteralPath $RuntimeRoot -Recurse -Force | ForEach-Object FullName)+@($TunnelExecutable)
 $parents=@()
 foreach($leaf in @($RuntimeRoot,$TunnelExecutable)){
  $cursor=[IO.Path]::GetDirectoryName($leaf)
  while($cursor -and $cursor -ne 'C:\'){$parents+=$cursor;$cursor=[IO.Path]::GetDirectoryName($cursor)}
 }
 $all=@(($scope+$parents)|Select-Object -Unique)
 $backup=@();$plans=@();$hashes=@{}
 foreach($path in $all){
  Assert-NoReparse $path
  $acl=Get-Acl -LiteralPath $path
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if($owner -notin $trusted){throw 'Untrusted runtime/ancestor owner; review before changing permissions'}
  $backup+=@{Path=$path;Sddl=$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]'Owner,Group,Access')}
  $target=$path -in $scope
  if(Test-Path -LiteralPath $path -PathType Leaf){$hashes[$path]=Hash $path}
  $needsChange=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object {
   $sid=$_.IdentityReference.Value
   $_.AccessControlType -eq 'Allow' -and $sid -notin $trusted -and
   (($target -and ($_.FileSystemRights -band $write) -ne 0) -or
    (-not $target -and ($_.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and ($_.FileSystemRights -band $danger) -ne 0))
  }).Count -gt 0
  if(-not $needsChange){continue}
  if(@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object AccessControlType -eq 'Deny').Count){throw 'Existing deny permissions require a reviewed hardening plan'}
  # Rewrite a complete DACL: inherited ACEs cannot be reliably removed in memory before persistence.
  $sections=[Security.AccessControl.AccessControlSections]'Owner,Group,Access'
  $raw=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorSddlForm($sections))
  $rewritten=[Security.AccessControl.RawAcl]::new($raw.DiscretionaryAcl.Revision,$raw.DiscretionaryAcl.Count*2)
  foreach($ace in $raw.DiscretionaryAcl){
   $ace.AceFlags=[Security.AccessControl.AceFlags]([int]$ace.AceFlags -band (255 -bxor [int][Security.AccessControl.AceFlags]::Inherited))
   $qualified=$ace -is [Security.AccessControl.QualifiedAce]
   $foreign=$qualified -and $ace.AceQualifier -eq [Security.AccessControl.AceQualifier]::AccessAllowed -and $ace.SecurityIdentifier.Value -notin $trusted
   if($target -and $foreign -and ($ace.AccessMask -band $write) -ne 0){
    $ace.AccessMask=[int][Security.AccessControl.FileSystemRights]'ReadAndExecute,Synchronize'
   }elseif(-not $target -and $foreign -and ([int]$ace.AceFlags -band [int][Security.AccessControl.AceFlags]::InheritOnly) -eq 0 -and ($ace.AccessMask -band $danger) -ne 0){
    # Keep the original writer mask for unrelated descendants, but remove replacement rights on this parent.
    $inheritMask=[Security.AccessControl.AceFlags]'ContainerInherit,ObjectInherit'
    if(([int]$ace.AceFlags -band [int]$inheritMask) -ne 0){
     $bytes=New-Object byte[] $ace.BinaryLength;$ace.GetBinaryForm($bytes,0)
     $childAce=[Security.AccessControl.GenericAce]::CreateFromBinaryForm($bytes,0)
     $childAce.AceFlags=[Security.AccessControl.AceFlags]([int]$childAce.AceFlags -bor [int][Security.AccessControl.AceFlags]::InheritOnly)
     $rewritten.InsertAce($rewritten.Count,$childAce)
    }
    $ace.AceFlags=[Security.AccessControl.AceFlags]::None
    $parentMask=[int]$ace.AccessMask
    if(($parentMask -band 268435456) -ne 0){$parentMask=($parentMask -band (-bnot 268435456)) -bor [int][Security.AccessControl.FileSystemRights]::FullControl}
    $ace.AccessMask=$parentMask -band (-bnot $danger)
   }
   $rewritten.InsertAce($rewritten.Count,$ace)
  }
  $raw.DiscretionaryAcl=$rewritten
  $raw.SetFlags([Security.AccessControl.ControlFlags]([int]$raw.ControlFlags -bor [int][Security.AccessControl.ControlFlags]::DiscretionaryAclProtected))
  $acl.SetSecurityDescriptorSddlForm($raw.GetSddlForm([Security.AccessControl.AccessControlSections]::Access),[Security.AccessControl.AccessControlSections]::Access)
  $plans+=@{Path=$path;Acl=$acl;Target=$target}
 }
 $backupPath=Join-Path (Split-Path $PackageRoot -Parent) ('runtime-acl-before-'+[Guid]::NewGuid().ToString('N')+'.json')
 Write-Json $backupPath @{Created=[DateTime]::UtcNow.ToString('o');Purpose='Explicit runtime permission hardening';Entries=$backup}
 Protect $backupPath $null
 try{
  # Seal deepest targets first; parent inheritance cannot reintroduce writable ACEs.
  foreach($plan in @($plans | Sort-Object @{Expression={$_.Path.Length};Descending=$true})){Set-Acl -LiteralPath $plan.Path -AclObject $plan.Acl}
  foreach($path in $scope){Assert-Protected $path}
  Assert-ImmutableParents $RuntimeRoot;Assert-ImmutableParents $TunnelExecutable;Assert-ImmutableParents $NodePath
  foreach($path in $hashes.Keys){if((Hash $path) -ne $hashes[$path]){throw 'Runtime content changed during permission hardening'}}
 }catch{
  $failure=$_
  # Restore known pre-change ACLs on failure. Never silently leave a partial hardening operation.
  $restoreFailed=$false
  foreach($entry in @($backup | Sort-Object @{Expression={$_.Path.Length}})){
   try{$restore=Get-Acl -LiteralPath $entry.Path;$restore.SetSecurityDescriptorSddlForm($entry.Sddl,[Security.AccessControl.AccessControlSections]::Access);Set-Acl -LiteralPath $entry.Path -AclObject $restore}catch{$restoreFailed=$true}
  }
  if($restoreFailed){throw "Permission restoration incomplete; preserve protected backup: $backupPath"}
  throw $failure
 }
 Write-Output "Runtime permission backup: $backupPath"
}
function Remove-WorkerIdentity([string]$Sid){
 $canonicalSid=([Security.Principal.SecurityIdentifier]::new($Sid)).Value
 # Never remove an account while one of its processes can still act.
 foreach($process in Get-CimInstance Win32_Process){try{$owner=$process|Invoke-CimMethod -MethodName GetOwnerSid -ErrorAction Stop;if($owner.ReturnValue -eq 0 -and $owner.Sid -eq $canonicalSid){throw 'Worker process remains active'}}catch{if($_.Exception.Message -eq 'Worker process remains active'){throw}}}
 $profile=Get-CimInstance Win32_UserProfile -Filter "SID='$canonicalSid'"
 if($null -ne $profile -and -not $profile.Loaded){$profile|Remove-CimInstance}
 [SmartHomeWorkerRights]::Apply($canonicalSid,$true)
 Remove-LocalUser -Name $WorkerName
 if($null -ne $profile -and $profile.Loaded){
  # Windows can retain a batch-logon hive after every worker process has exited.
  # Retire it at next startup rather than forcing an unsafe hive unload.
  $script:ProfileCleanupPending=$true
  $cleanup=Join-Path $Root 'recovery\Remove-WorkerProfile.ps1'
  Copy-Item -LiteralPath (Join-Path $PackageRoot 'scripts\Remove-WorkerProfile.ps1') -Destination $cleanup
  Protect $cleanup $null
  Write-Json (Join-Path $Root 'recovery\profile-cleanup.json') @{Sid=$canonicalSid;Reason='Windows batch-logon profile cache';RetireAt='next startup'}
  $action=New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$cleanup`""
  $principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName 'SmartHome-WebCoRE-ProfileCleanup' -Action $action -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal|Out-Null
  Write-Output 'Worker account retired; Windows retains its unloaded-process profile cache. Protected cleanup is scheduled for next startup.'
 }
}
function Export-Task([string]$Name){$scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();[string]$scheduler.GetFolder('\').GetTask($Name).Xml}
function Snapshot([string]$Source,[string]$Commit,[string]$EntryPoint,[switch]$IsSnapshot){
 Assert-NoReparse $Source
 $destination=Join-Path $Root "releases\$Commit"
 if(Test-Path -LiteralPath $destination){throw 'Release destination already exists'}
 New-Item -ItemType Directory -Path $destination | Out-Null
 foreach($directory in @('server','test','.codex-plugin')){if(Test-Path -LiteralPath (Join-Path $Source $directory)){Get-ChildItem -LiteralPath (Join-Path $Source $directory) -Recurse -Force | ForEach-Object{Assert-NoReparse $_.FullName};Copy-Item -LiteralPath (Join-Path $Source $directory) -Destination $destination -Recurse}}
 foreach($file in @('package.json','plugin.json','mcp.json','.mcp.json')){Copy-Item -LiteralPath (Join-Path $Source $file) -Destination $destination}
 if(Test-Path -LiteralPath (Join-Path $Source 'windows-readonly-launcher.cjs')){Copy-Item -LiteralPath (Join-Path $Source 'windows-readonly-launcher.cjs') -Destination $destination}
 Protect $destination $script:WorkerSid
 $files=[ordered]@{}
 Get-ChildItem -LiteralPath $destination -Recurse -File | Sort-Object FullName | ForEach-Object{$files[$_.FullName.Substring($destination.Length+1).Replace('\','/')]=Hash $_.FullName}
 $digest=Text-Hash ($files|ConvertTo-Json -Compress)
 $version=(Get-Content (Join-Path $destination 'package.json') -Raw|ConvertFrom-Json).version
 $release=@{Commit=$Commit;Sha256=$digest;Root=$destination;Files=$files;Version=$version;IsSnapshot=[bool]$IsSnapshot;EntryPoint=$EntryPoint}
 Write-Json (Join-Path $Root "catalog\$Commit.json") $release
 return $release
}
function Existing-Verify{
 Assert-Protected (Join-Path $Root 'config.json')
 $cfg=Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw|ConvertFrom-Json
 if('SchemaVersion' -notin $cfg.PSObject.Properties.Name -or $cfg.SchemaVersion -ne 2){throw 'Existing installation requires reviewed schema migration; never overwrite it'}
 $state=Get-Content -LiteralPath (Join-Path $Root 'state.json') -Raw|ConvertFrom-Json
 Assert-Protected $Root $cfg.WorkerSid
 Assert-Protected (Join-Path $Root 'config.json') $cfg.WorkerSid
 Assert-Protected (Join-Path $Root 'bin\VmManagement.exe') $cfg.WorkerSid
 if((Hash (Join-Path $Root 'bin\VmManagement.exe'))-ne $cfg.ExeSha256){throw 'Host integrity mismatch'}
 if((Hash $cfg.NodePath)-ne $cfg.NodeSha256 -or (Hash $cfg.WorkerNodePath)-ne $cfg.WorkerNodeSha256){throw 'Node integrity mismatch'}
 $task=Get-ScheduledTask -TaskName $WorkerTask
 if($task.State -ne 'Running' -or (Get-ScheduledTask -TaskName $BrokerTask).State -ne 'Running'){throw 'Management tasks are not running'}
 if($task.Principal.UserId -notin @($cfg.WorkerSid,"$env:COMPUTERNAME\$WorkerName",$WorkerName)-or $task.Principal.RunLevel -ne 'Limited'){throw 'Worker identity/privilege mismatch'}
 if((Get-LocalGroupMember -SID 'S-1-5-32-544').SID.Value -contains $cfg.WorkerSid){throw 'Worker is administrator'}
 if((Text-Hash (Export-Task 'SmartHome-WebCoRE-MCP'))-ne $cfg.McpTaskXmlSha256 -or (Text-Hash (Export-Task 'SmartHome-WebCoRE-Watchdog'))-ne $cfg.WatchdogTaskXmlSha256){throw 'Existing task drift'}
 Assert-Protected $cfg.TunnelConfig
 if((Hash $cfg.TunnelConfig)-ne $state.ConfigSha256 -or $state.Recovery -ne 'clean'){throw 'Recovery/configuration drift requires review'}
 $fw=Get-NetFirewallRule -Name $FirewallName
 if($fw.Enabled -ne 'True' -or $fw.Action -ne 'Block' -or $fw.Direction -ne 'Outbound'){throw 'Worker firewall mismatch'}
 if(@(Get-NetFirewallProfile|Where-Object Enabled -ne $true).Count){throw 'Windows Firewall must remain enabled'}
 Write-Output 'VERIFY PASS: protected inputs, isolated identity, task preservation and recovery state.'
}
if($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess){throw 'Use 64-bit administrator Windows PowerShell on TERMINAL'}
if($Root -ne 'C:\ProgramData\SmartHome\VmManagement'){throw 'Fixed production root required'}
$manifestPath=Join-Path $PackageRoot 'vm-package-manifest.json'
if(-not(Test-Path -LiteralPath $manifestPath)){throw 'Pinned production package manifest missing; build CI artifact first'}
Assert-Protected $PackageRoot
Assert-ImmutableParents $PackageRoot
Assert-ImmutableParents $Root
Assert-Protected $manifestPath
$manifest=Get-Content -LiteralPath $manifestPath -Raw|ConvertFrom-Json
if($manifest.Commit -notmatch '\A[a-f0-9]{40}\z'){throw 'Invalid pinned package commit'}
foreach($entry in $manifest.Files.PSObject.Properties){
 if($entry.Name -match '(^|[\\/])\.\.?([\\/]|$)|:' -or [IO.Path]::IsPathRooted($entry.Name)){throw 'Unsafe package path'}
 $path=Join-Path $PackageRoot $entry.Name;Assert-Protected $path
 if((Hash $path)-ne $entry.Value){throw 'Package integrity mismatch'}
}
$rightsPath=Join-Path $PackageRoot 'scripts\VmWorkerRights.ps1'
$rightsBytes=[IO.File]::ReadAllBytes($rightsPath);$sha=[Security.Cryptography.SHA256]::Create()
try{$rightsDigest=[BitConverter]::ToString($sha.ComputeHash($rightsBytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
if($rightsDigest -ne $manifest.Files.'scripts/VmWorkerRights.ps1'){throw 'Worker-rights helper integrity mismatch'}
. ([scriptblock]::Create([Text.Encoding]::UTF8.GetString($rightsBytes)))
if($Mode -in @('Verify','Recover','Uninstall')){
 if($Mode -eq 'Verify'){Existing-Verify;exit 0}
 Assert-Protected (Join-Path $Root 'config.json')
 $cfg=Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw|ConvertFrom-Json
 if($Mode -eq 'Recover'){
  Assert-Protected (Join-Path $Root 'recovery\original-tunnel.yaml')
  Stop-ScheduledTask -TaskName $BrokerTask -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName $BrokerTask|Out-Null
  Stop-ScheduledTask -TaskName $WorkerTask -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName $WorkerTask|Out-Null
  $watchdog=Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog'
  $recoveryState=Get-Content -LiteralPath (Join-Path $Root 'state.json') -Raw|ConvertFrom-Json
  if($recoveryState.Recovery -eq 'clean' -and (Hash $cfg.TunnelConfig) -eq $cfg.InitialConfigSha256 -and (Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP').State -eq 'Running' -and $watchdog.Settings.Enabled){Write-Output 'Original runtime already selected; management tasks disabled without restarting MCP.';exit 0}
  try{
   Disable-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog' | Out-Null
   Stop-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP'
   Start-Sleep -Seconds 3
   if(@(Get-Process tunnel-client -ErrorAction SilentlyContinue).Count){throw 'Tunnel remains running; do not overwrite configuration'}
   $backup=Join-Path $Root 'recovery\original-tunnel.yaml'
   if((Hash $backup)-ne $cfg.InitialConfigSha256){throw 'Recovery backup mismatch'}
   [IO.File]::WriteAllBytes($cfg.TunnelConfig,[IO.File]::ReadAllBytes($backup))
   Start-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP'
   Write-Output 'Original configuration restored. Broker remains stopped. Verify the original MCP read path in a fresh chat before any further work.'
  }finally{Enable-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog'|Out-Null}
  exit 0
 }
 # Uninstall only after recovery has disabled management; do not race an approved cutover.
 $broker=Get-ScheduledTask -TaskName $BrokerTask -ErrorAction SilentlyContinue
 if($null -ne $broker -and $broker.Settings.Enabled){throw 'Run Recover and verify the original runtime before uninstall'}
 # Uninstall retains protected audit and recovery files; never remove an active payload.
 $text=Get-Content -LiteralPath $cfg.TunnelConfig -Raw
 if($text.Contains($Root)-or $text.Contains($Root.Replace('\','\\'))){throw 'Restore and verify original runtime with Recover before uninstall'}
 if(Test-Path -LiteralPath (Join-Path $Root 'installed.json')){Remove-Item -LiteralPath (Join-Path $Root 'installed.json')}
 foreach($name in @($BrokerTask,$WorkerTask)){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 Remove-WorkerIdentity $cfg.WorkerSid
 Remove-NetFirewallRule -Name $FirewallName -ErrorAction SilentlyContinue
 if(Test-Path -LiteralPath $ApprovalShortcut){Remove-Item -LiteralPath $ApprovalShortcut}
 Write-Output 'Management tasks, firewall rule and worker account removed. Protected audit/recovery inventory retained; no live MCP/watchdog task removed.'
 exit 0
}
if(Test-Path -LiteralPath (Join-Path $Root 'config.json')){
 Existing-Verify
 if($Mode -eq 'Install'){Write-Output 'Already installed: no task, credential, account or ACL was overwritten.'}
 exit 0
}
$mcp=Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP' -TaskPath '\'
$watchdog=Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog' -TaskPath '\'
if($mcp.Principal.UserId -notin @('SYSTEM','S-1-5-18','NT AUTHORITY\SYSTEM')){throw 'Unexpected existing service identity; installer never elevates it'}
if($mcp.State -ne 'Running' -or -not $watchdog.Settings.Enabled){throw 'Existing runtime/watchdog not healthy; preserve it and diagnose first'}
$mcpXml=Export-Task 'SmartHome-WebCoRE-MCP';$watchdogXml=Export-Task 'SmartHome-WebCoRE-Watchdog'
# Bind discovery to the actual scheduled-task action, never a filename/content search.
if(@($mcp.Actions).Count -ne 1){throw 'Exactly one existing MCP task action required'}
$configMatches=@([regex]::Matches([string]$mcp.Actions[0].Arguments,'(?i)(?:^|\s)--config(?:=|\s+)(?:"([^"]+)"|''([^'']+)''|(\S+))'))
if($configMatches.Count -ne 1){throw 'Unique --config task argument required; preserve runtime and review task'}
$taskConfig=@($configMatches[0].Groups | Select-Object -Skip 1 | Where-Object Success | ForEach-Object Value)[0]
if(-not [IO.Path]::IsPathRooted($taskConfig)){throw 'Absolute existing task configuration path required'}
$taskConfig=[IO.Path]::GetFullPath($taskConfig)
if($TunnelConfigPath -and [IO.Path]::GetFullPath($TunnelConfigPath) -ne $taskConfig){throw 'Supplied configuration differs from active task'}
$TunnelConfigPath=$taskConfig
Assert-Protected $TunnelConfigPath
$yaml=[IO.File]::ReadAllText($TunnelConfigPath)
$paths=@([regex]::Matches($yaml,'[A-Za-z]:[\\/][^"''\r\n:]*?(?:[\\/]server[\\/]index\.js|[\\/]windows-readonly-launcher\.cjs)') | ForEach-Object Value)
if($paths.Count -ne 1){throw 'Unique supported current MCP payload path not established'}
$commandText=$paths[0]
$commandPath=[IO.Path]::GetFullPath($commandText.Replace('\\','\').Replace('/','\'))
$commandEncoding=if($commandText.Contains('\\')){'escaped'}elseif($commandText.Contains('/')){'forward'}else{'backslash'}
$entryPoint=if([IO.Path]::GetFileName($commandPath) -eq 'windows-readonly-launcher.cjs'){'windows-readonly-launcher.cjs'}else{'server/index.js'}
$originalRoot=if($entryPoint -eq 'server/index.js'){Split-Path (Split-Path $commandPath -Parent) -Parent}else{Split-Path $commandPath -Parent}
Assert-NoReparse $originalRoot
Assert-NoReparse $commandPath
if($Mode -ne 'HardenRuntime'){Assert-Protected $originalRoot;Assert-Protected $commandPath;Assert-ImmutableParents $commandPath}
if($entryPoint -eq 'windows-readonly-launcher.cjs'){
 # Only the reviewed, fixed environment-enabling wrapper is supported, never arbitrary code.
 $wrapper=[IO.File]::ReadAllText($commandPath)
 $contract='\A\s*''use strict'';\s*process\.env\.WEBCORE_WINDOWS_MANAGEMENT_READONLY\s*=\s*''enabled'';\s*require\(''\./server/index\.js''\);\s*\z'
 if($wrapper -cnotmatch $contract){throw 'Unsupported launcher content; preserve runtime and review it'}
}
if(-not(Test-Path -LiteralPath (Join-Path $originalRoot 'package.json'))){throw 'Current runtime package missing'}
# Prove the currently running tunnel child matches the selected script before provisioning.
$tunnelExe=[string]$mcp.Actions[0].Execute
$tunnels=@(Get-CimInstance Win32_Process -Filter "Name='tunnel-client.exe'" | Where-Object ExecutablePath -eq $tunnelExe)
if($tunnels.Count -ne 1){throw 'Unique current tunnel process required'}
$nodes=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object ParentProcessId -eq $tunnels[0].ProcessId)
$commandCandidates=@($commandPath,$commandPath.Replace('\','/'))
$matched=@($nodes | Where-Object {
 $line=[string]$_.CommandLine
 $_.ExecutablePath -eq $NodePath -and @($commandCandidates | Where-Object {$line.EndsWith(' '+$_,[StringComparison]::OrdinalIgnoreCase) -or $line.EndsWith('"'+$_+'"',[StringComparison]::OrdinalIgnoreCase)}).Count -eq 1
})
if($nodes.Count -ne 1 -or $matched.Count -ne 1){throw 'Running MCP payload does not match active task configuration'}
Assert-Protected $NodePath
if($Mode -ne 'HardenRuntime'){
 Assert-ImmutableParents $NodePath
 $version=& $NodePath --version
 if($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.'){throw 'Pinned Node.js 24 required'}
}
$tunnelExe=[string]$mcp.Actions[0].Execute
if([IO.Path]::GetFileName($tunnelExe)-ne 'tunnel-client.exe'){throw 'Unexpected MCP launcher; review task action before installing'}
if($Mode -ne 'HardenRuntime'){Assert-Protected $tunnelExe;Assert-ImmutableParents $tunnelExe}
if($Mode -ne 'HardenRuntime'){Assert-ImmutableParents $NodePath}
if(@(Get-NetFirewallProfile|Where-Object Enabled -ne $true).Count){throw 'Firewall must be enabled on all profiles'}
if(Get-LocalUser -Name $WorkerName -ErrorAction SilentlyContinue){throw 'Worker account already exists without a verified installation'}
if(Test-Path -LiteralPath $Root){throw 'Partial installation exists; inspect/recover before retry, never overwrite'}
if(Test-Path -LiteralPath $ApprovalShortcut){throw 'Approval shortcut already exists without a verified installation'}
if($Mode -eq 'HardenRuntime'){
 $runtimeConfigHash=Hash $TunnelConfigPath
 Harden-Runtime $originalRoot $tunnelExe
 if((Hash $TunnelConfigPath) -ne $runtimeConfigHash){throw 'Configuration drift during permission hardening'}
 if((Text-Hash (Export-Task 'SmartHome-WebCoRE-MCP')) -ne (Text-Hash $mcpXml) -or (Text-Hash (Export-Task 'SmartHome-WebCoRE-Watchdog')) -ne (Text-Hash $watchdogXml)){throw 'Task drift during permission hardening'}
 Assert-Protected $originalRoot;Assert-Protected $commandPath;Assert-Protected $tunnelExe
 Assert-ImmutableParents $commandPath;Assert-ImmutableParents $tunnelExe;Assert-ImmutableParents $NodePath
 Write-Output 'RUNTIME ACL PASS: immutable public code; protected backup retained; no content, task, credential or process changes.'
 exit 0
}
Write-Output 'PREFLIGHT PASS: pinned package verified; existing SYSTEM identity retained; no production changes made.'
if($Mode -eq 'Preflight'){exit 0}
if($Activate){throw 'Initial activation is a separate approved release cutover through the broker; Install never restarts production'}
# Installation provisions only the boundary. Existing tunnel, watchdog and credentials stay byte-identical.
$created=$false;$createdRoot=$false;$cfg=$null;$script:ProfileCleanupPending=$false;$initialConfigSha256=Hash $TunnelConfigPath
try{
 $random=New-Object byte[] 48;$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($random);$rng.Dispose()
 $password=[Convert]::ToBase64String($random)+'aA1!'
 $secure=ConvertTo-SecureString $password -AsPlainText -Force
 New-LocalUser -Name $WorkerName -Password $secure -AccountNeverExpires -PasswordNeverExpires -Description 'Restricted SmartHome validation worker'|Out-Null
 $created=$true;$script:WorkerSid=(Get-LocalUser -Name $WorkerName).SID.Value
 [SmartHomeWorkerRights]::Apply($WorkerSid,$false)
 if((Get-LocalGroupMember -SID 'S-1-5-32-545').SID.Value -notcontains $WorkerSid){Add-LocalGroupMember -SID 'S-1-5-32-545' -Member $WorkerName}
 New-Item -ItemType Directory -Path $Root|Out-Null;$createdRoot=$true;Protect $Root $WorkerSid
 foreach($directory in @('bin','catalog','releases','audit','recovery','downloads','scratch')){New-Item -ItemType Directory -Path (Join-Path $Root $directory)|Out-Null}
 Protect (Join-Path $Root 'scratch') $WorkerSid -Writable
 Protect (Join-Path $Root 'audit') $null
 Protect (Join-Path $Root 'recovery') $null
 Protect (Join-Path $Root 'downloads') $null
 foreach($binary in @('VmManagement.exe','VmManagementApprove.exe')){Copy-Item -LiteralPath (Join-Path $PackageRoot "bin\$binary") -Destination (Join-Path $Root "bin\$binary")}
 Copy-Item -LiteralPath $NodePath -Destination (Join-Path $Root 'bin\node.exe')
 $baselineCommit=(Text-Hash $commandPath).Substring(0,40)
 $baseline=Snapshot $originalRoot $baselineCommit $entryPoint -IsSnapshot
 $candidate=Snapshot $PackageRoot $manifest.Commit $entryPoint
 Copy-Item -LiteralPath $TunnelConfigPath -Destination (Join-Path $Root 'recovery\original-tunnel.yaml')
 [IO.File]::WriteAllText((Join-Path $Root 'recovery\original-mcp-task.xml'),$mcpXml,$Utf8)
 [IO.File]::WriteAllText((Join-Path $Root 'recovery\original-watchdog-task.xml'),$watchdogXml,$Utf8)
 $cfg=@{SchemaVersion=2;Root=$Root;WorkerSid=$WorkerSid;OperatorSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;ExeSha256=Hash (Join-Path $Root 'bin\VmManagement.exe');NodePath=$NodePath;NodeSha256=Hash $NodePath;WorkerNodePath=Join-Path $Root 'bin\node.exe';WorkerNodeSha256=Hash (Join-Path $Root 'bin\node.exe');TunnelConfig=$TunnelConfigPath;TunnelExe=$tunnelExe;TunnelExeSha256=Hash $tunnelExe;McpTaskXmlSha256=Text-Hash $mcpXml;WatchdogTaskXmlSha256=Text-Hash $watchdogXml;InitialCommand=$commandPath;ReleaseEntryPoint=$entryPoint;InitialConfigSha256=Hash $TunnelConfigPath;CandidateCommit=$candidate.Commit;CandidateSha256=$candidate.Sha256}
 Write-Json (Join-Path $Root 'config.json') $cfg
 Write-Json (Join-Path $Root 'state.json') @{Current=$baseline;Previous=$null;CommandRoot=$originalRoot;CommandText=$commandText;CommandEncoding=$commandEncoding;ConfigSha256=Hash $TunnelConfigPath;Recovery='clean'}
 New-NetFirewallRule -Name $FirewallName -DisplayName 'SmartHome restricted worker outbound deny' -Direction Outbound -Action Block -Profile Any -LocalUser "D:(A;;CC;;;$WorkerSid)" | Out-Null
 $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
 $trigger=New-ScheduledTaskTrigger -AtStartup
 $workerAction=New-ScheduledTaskAction -Execute (Join-Path $Root 'bin\VmManagement.exe') -Argument 'worker' -WorkingDirectory (Join-Path $Root 'bin')
 $workerPrincipal=New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$WorkerName" -LogonType Password -RunLevel Limited
 $workerDefinition=New-ScheduledTask -Action $workerAction -Trigger $trigger -Settings $settings -Principal $workerPrincipal
 Register-ScheduledTask -TaskName $WorkerTask -InputObject $workerDefinition -User "$env:COMPUTERNAME\$WorkerName" -Password $password | Out-Null
 $password=$null;$secure=$null;[Array]::Clear($random,0,$random.Length)
 $brokerAction=New-ScheduledTaskAction -Execute (Join-Path $Root 'bin\VmManagement.exe') -Argument 'broker' -WorkingDirectory (Join-Path $Root 'bin')
 $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
 Register-ScheduledTask -TaskName $BrokerTask -Action $brokerAction -Trigger $trigger -Settings $settings -Principal $principal|Out-Null
 Start-ScheduledTask -TaskName $WorkerTask;Start-ScheduledTask -TaskName $BrokerTask
 for($attempt=0;$attempt -lt 15;$attempt++){if((Get-ScheduledTask -TaskName $WorkerTask).State -eq 'Running' -and (Get-ScheduledTask -TaskName $BrokerTask).State -eq 'Running'){break};Start-Sleep -Seconds 1}
 if((Get-ScheduledTask -TaskName $WorkerTask).State -ne 'Running' -or (Get-ScheduledTask -TaskName $BrokerTask).State -ne 'Running'){throw 'New management tasks failed to start; no production cutover occurred'}
 if((Hash $TunnelConfigPath)-ne $cfg.InitialConfigSha256 -or (Text-Hash (Export-Task 'SmartHome-WebCoRE-MCP'))-ne $cfg.McpTaskXmlSha256 -or (Text-Hash (Export-Task 'SmartHome-WebCoRE-Watchdog'))-ne $cfg.WatchdogTaskXmlSha256){throw 'Existing runtime preservation check failed'}
 # Explorer's filtered token cannot read the protected native host. Elevate a public Windows
 # executable first; never add ordinary-user readers to the management input boundary.
 $shell=New-Object -ComObject WScript.Shell;$shortcut=$shell.CreateShortcut($ApprovalShortcut)
 $shortcut.TargetPath="$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
 $shortcut.Arguments='-NoProfile -Command "& '''+(Join-Path $Root 'bin\VmManagement.exe')+''' operator"'
 $shortcut.WorkingDirectory=$env:WINDIR;$shortcut.Description='Independent scoped approvals for Smart Home VM management';$shortcut.Save()
 $shortcutBytes=[IO.File]::ReadAllBytes($ApprovalShortcut)
 if($shortcutBytes.Length -lt 76 -or [BitConverter]::ToUInt32($shortcutBytes,0) -ne 76){throw 'Unexpected approval shortcut format'}
 $shortcutFlags=[BitConverter]::ToUInt32($shortcutBytes,20)
 [BitConverter]::GetBytes([uint32]($shortcutFlags -bor 0x2000)).CopyTo($shortcutBytes,20)
 [IO.File]::WriteAllBytes($ApprovalShortcut,$shortcutBytes)
 Existing-Verify
 Write-Json (Join-Path $Root 'installed.json') @{enabled=$true;version=1}
 Write-Output "INSTALL PASS: boundary provisioned; production not cut over. Candidate commit: $($candidate.Commit); manifest SHA-256: $($candidate.Sha256). Use independent operator approval for activation."
}catch{
 # Never scatter repairs across existing service/tunnel. Remove only new task/account/rule on failure.
 foreach($name in @($BrokerTask,$WorkerTask)){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 if(Test-Path -LiteralPath $ApprovalShortcut){Remove-Item -LiteralPath $ApprovalShortcut}
 $identityRetired=-not $created
 if($created){try{Remove-WorkerIdentity $WorkerSid;$identityRetired=$true}catch{Write-Warning 'Worker identity/profile cleanup remains owed; protected recovery inventory retained'}}
 if($identityRetired){Remove-NetFirewallRule -Name $FirewallName -ErrorAction SilentlyContinue}
 if($createdRoot -and -not $script:ProfileCleanupPending -and (Test-Path -LiteralPath $Root) -and (Hash $TunnelConfigPath) -eq $initialConfigSha256 -and @(Get-ChildItem -LiteralPath (Join-Path $Root 'audit') -File -ErrorAction SilentlyContinue).Count -eq 0){try{Get-ChildItem -LiteralPath $Root -Recurse -Force|ForEach-Object{Assert-NoReparse $_.FullName};Remove-Item -LiteralPath $Root -Recurse -Force}catch{Write-Warning 'Protected partial-install inventory retained for review'}}
 throw
}
