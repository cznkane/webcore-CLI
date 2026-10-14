#Requires -Version 5.1
#Requires -RunAsAdministrator
# Disposable hosted-runner integration only. Never use on TERMINAL.
[CmdletBinding()]
param([ValidateSet('direct','wrapper')][string]$Layout='direct')
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:COMPUTERNAME -eq 'TERMINAL'){throw 'Disposable GitHub Windows runner required'}
$source=Split-Path $PSScriptRoot -Parent
$root='C:\ProgramData\SmartHome\VmManagement'
$fixture='C:\SmartHome\VmManagementFixture'
$webcore='C:\ProgramData\SmartHome\WebCoRE'
$package='C:\ProgramData\SmartHome\VmManagementFixturePackage'
$createdTasks=@()
function Assert($Condition,[string]$Name){if(-not $Condition){throw "FAIL: $Name"};Write-Output "PASS: $Name"}
function Secure([string]$Path){
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
 foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
function Read-FrameBytes($Stream,[int]$Length){$bytes=New-Object byte[] $Length;$offset=0;while($offset-lt $Length){$n=$Stream.Read($bytes,$offset,$Length-$offset);if($n-le 0){throw 'Frame EOF'};$offset+=$n};return ,$bytes}
function Invoke-Operator($Value){$json=$Value|ConvertTo-Json -Compress -Depth 8;$result=$json|& (Join-Path $root 'bin\VmManagement.exe') operator-client;if($LASTEXITCODE-ne 0){throw 'Operator client failure'};return ($result|ConvertFrom-Json)}
function Await-Request([string]$Id){for($i=0;$i-lt 150;$i++){Start-Sleep -Seconds 1;$all=Invoke-Operator @{action='list'};$r=@($all.requests|Where-Object requestId -eq $Id)[0];if($r.status -in @('succeeded','failed','denied')){return $r}};throw 'Request completion timeout'}
try{
 Assert (-not(Test-Path $root)) 'clean disposable installation root'
 foreach($name in @('SmartHome-WebCoRE-MCP','SmartHome-WebCoRE-Watchdog','SmartHome-WebCoRE-Management','SmartHome-WebCoRE-Worker')){Assert (-not(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) "no fixture collision $name"}
 New-Item -ItemType Directory -Path $fixture,$webcore|Out-Null
 Secure 'C:\SmartHome';Secure 'C:\ProgramData\SmartHome';Secure $fixture;Secure $webcore
 $payload=Join-Path $fixture 'payload';New-Item -ItemType Directory -Path $payload|Out-Null
 foreach($dir in @('server','test','.codex-plugin')){Copy-Item -LiteralPath (Join-Path $source $dir) -Destination $payload -Recurse}
 foreach($file in @('package.json','plugin.json','mcp.json','.mcp.json')){Copy-Item -LiteralPath (Join-Path $source $file) -Destination $payload}
 $entryPoint=if($Layout -eq 'wrapper'){'windows-readonly-launcher.cjs'}else{'server/index.js'}
 Copy-Item -LiteralPath (Join-Path $source 'windows-readonly-launcher.cjs') -Destination $payload
 # Non-runtime residue must not defeat protected source-file verification.
 [IO.File]::WriteAllText((Join-Path $payload 'retained-readme.txt'),'fixture residue')
 $node=Join-Path $fixture 'node.exe';Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination $node
 $fixtureSource=@'
using System;using System.Threading;using System.IO;using System.Diagnostics;using System.Text.RegularExpressions;
public class FixtureTunnel{public static void Main(string[] args){var text=File.ReadAllText(args[1]).Replace("\\\\","\\");var match=Regex.Match(text,@"[A-Za-z]:[\\/][^'\r\n]*?(?:[\\/]server[\\/]index\.js|[\\/]windows-readonly-launcher\.cjs)");var psi=new ProcessStartInfo{FileName=@"C:\SmartHome\VmManagementFixture\node.exe",Arguments="\""+match.Value+"\"",UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};var script=Path.GetFullPath(match.Value);var sourceRoot=script.EndsWith("index.js")?Path.GetDirectoryName(Path.GetDirectoryName(script)):Path.GetDirectoryName(script);if(sourceRoot.EndsWith("\\payload",StringComparison.OrdinalIgnoreCase))File.WriteAllText(Path.Combine(sourceRoot,"system-owned-canary.txt"),"not-secret");var child=Process.Start(psi);child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};child.BeginOutputReadLine();child.BeginErrorReadLine();while(true)Thread.Sleep(1000);}}
'@
 Add-Type -TypeDefinition $fixtureSource -OutputAssembly (Join-Path $fixture 'tunnel-client.exe') -OutputType ConsoleApplication
 $yaml=Join-Path $webcore 'fixture.yaml'
 $pointer=Join-Path $payload $entryPoint
 if($Layout -eq 'wrapper'){$pointer=$pointer.Replace('\','/')}
 [IO.File]::WriteAllText($yaml,"mcp:`n  commands:`n    - command: 'node $pointer'`n",[Text.UTF8Encoding]::new($false))
 $originalYaml=[IO.File]::ReadAllBytes($yaml)
 $decoy=Join-Path $webcore 'fixture.pre-release.yaml'
 [IO.File]::WriteAllText($decoy,"mcp: 'node C:/obsolete/server/index.js'",[Text.UTF8Encoding]::new($false))
 $principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
 $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
 $trigger=New-ScheduledTaskTrigger -AtStartup
 Register-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP' -Action (New-ScheduledTaskAction -Execute (Join-Path $fixture 'tunnel-client.exe') -Argument "--config $yaml") -Trigger $trigger -Settings $settings -Principal $principal|Out-Null;$createdTasks+='SmartHome-WebCoRE-MCP'
 Register-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog' -Action (New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument '-NoProfile -NonInteractive -Command exit') -Trigger $trigger -Settings $settings -Principal $principal|Out-Null;$createdTasks+='SmartHome-WebCoRE-Watchdog'
 Start-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP';Start-Sleep -Seconds 2
 $runtimeAcl=Get-Acl $payload
 $runtimeAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-11'),'Modify','ContainerInherit,ObjectInherit','None','Allow'))
 Set-Acl $payload $runtimeAcl
 foreach($publicExe in @($node,(Join-Path $fixture 'tunnel-client.exe'))){
  $acl=Get-Acl $publicExe;$acl.SetAccessRuleProtection($true,$true)
  $publicRights=if([IO.Path]::GetFileName($publicExe) -eq 'node.exe'){'ReadAndExecute'}else{'Modify'}
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-11'),$publicRights,'Allow'));Set-Acl $publicExe $acl
 }
 # Parent permits replacement of protected descendants, while sibling permissions must remain unchanged.
 $sibling=Join-Path $fixture 'unrelated';New-Item -ItemType Directory -Path $sibling|Out-Null
 $parentAcl=Get-Acl $fixture;$parentAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-11'),'Modify','ContainerInherit,ObjectInherit','None','Allow'));Set-Acl $fixture $parentAcl
 $siblingAclBefore=(Get-Acl $sibling).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
 # Never translate ACL identities to names: retired local accounts can remain on runtime/parents.
 $orphanSid=[Security.Principal.SecurityIdentifier]::new('S-1-5-21-2147483001-2147483002-2147483003-1999')
 $parentAcl=Get-Acl $fixture;$parentAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($orphanSid,'ReadAndExecute','None','None','Allow'));Set-Acl $fixture $parentAcl
 $runtimeAcl=Get-Acl $payload;$runtimeAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($orphanSid,'Modify','None','None','Allow'));Set-Acl $payload $runtimeAcl

 $parserErrors=$null;$tokens=$null
 [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Install-VmManagement.ps1'),[ref]$tokens,[ref]$parserErrors)|Out-Null
 Assert ($parserErrors.Count-eq 0) 'PowerShell installer syntax'
 & "$PSScriptRoot\Package-VmManagement.ps1" -Commit ('a'*40)
 Copy-Item -LiteralPath (Join-Path $source 'build\package') -Destination $package -Recurse
 $insecureRejected=$false
 try{& "$PSScriptRoot\Install-VmManagement.ps1" -Mode Preflight -PackageRoot $package -NodePath $node}catch{$insecureRejected=$_.Exception.Message.StartsWith('Unprotected management input')}
 Assert $insecureRejected 'foreign runtime writers rejected before installation'
 $tunnelPidBefore=@(Get-Process tunnel-client)[0].Id
 try{& "$PSScriptRoot\Install-VmManagement.ps1" -Mode HardenRuntime -PackageRoot $package -NodePath $node}catch{Write-Output ("Hardening failure location: "+$_.ScriptStackTrace);throw}
 Assert (@(Get-Process tunnel-client)[0].Id -eq $tunnelPidBefore) 'permission hardening does not restart service'
 $orphanRules=@((Get-Acl $payload).GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|Where-Object {$_.IdentityReference.Value -eq $orphanSid.Value})
 Assert ($orphanRules.Count -eq 1 -and ($orphanRules[0].FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write) -eq 0) 'unresolved identity writer restricted by numeric SID'
 Assert ((Get-Acl (Join-Path $payload 'system-owned-canary.txt')).GetOwner([Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-18') 'permission hardening preserves SYSTEM file ownership'
 Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($yaml)) -eq [Convert]::ToBase64String($originalYaml)) 'permission hardening preserves exact configuration bytes'
 Assert ((Get-Acl $sibling).GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access) -eq $siblingAclBefore) 'unrelated sibling permissions preserved'
 Assert (@(Get-ChildItem (Split-Path $package -Parent) -Filter 'runtime-acl-before-*.json').Count -eq 1) 'protected permission backup retained'
 try{& "$PSScriptRoot\Install-VmManagement.ps1" -Mode HardenRuntime -PackageRoot $package -NodePath $node}catch{Write-Output ("Hardening failure location: "+$_.ScriptStackTrace);throw}
 Assert (@(Get-Process tunnel-client)[0].Id -eq $tunnelPidBefore) 'permission hardening is idempotent and preserves process'
 $wrongConfigRejected=$false
 try{& "$PSScriptRoot\Install-VmManagement.ps1" -Mode Preflight -PackageRoot $package -NodePath $node -TunnelConfigPath $decoy}catch{$wrongConfigRejected=$_.Exception.Message -eq 'Supplied configuration differs from active task'}
 Assert $wrongConfigRejected 'stale backup cannot be substituted for active configuration'
 if($Layout -eq 'wrapper'){
  $wrapperPath=Join-Path $payload $entryPoint;$originalWrapper=[IO.File]::ReadAllText($wrapperPath)
  [IO.File]::WriteAllText($wrapperPath,$originalWrapper+"`nprocess.env.EXTRA = 'unapproved';")
  $unsupportedRejected=$false
  try{& "$PSScriptRoot\Install-VmManagement.ps1" -Mode Preflight -PackageRoot $package -NodePath $node}catch{$unsupportedRejected=$_.Exception.Message -eq 'Unsupported launcher content; preserve runtime and review it'}
  Assert $unsupportedRejected 'unreviewed wrapper code fails preflight'
  [IO.File]::WriteAllText($wrapperPath,$originalWrapper,[Text.UTF8Encoding]::new($false))
 }
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Preflight -PackageRoot $package -NodePath $node
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Install -PackageRoot $package -NodePath $node
 Start-Sleep -Seconds 3
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Install -PackageRoot $package -NodePath $node
 Assert ((Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP').State-eq 'Running') 'installation preserves existing runtime'
 $workerSid=(Get-LocalUser -Name 'SmartHomeVmWorker').SID.Value
 $state=Get-Content "$root\state.json" -Raw|ConvertFrom-Json
 Assert ($state.Current.EntryPoint -eq $entryPoint -and (Test-Path (Join-Path $state.Current.Root $entryPoint))) 'snapshot preserves actual entry point'
 Assert ((Get-Content "$root\config.json" -Raw|ConvertFrom-Json).TunnelConfig -eq $yaml) 'active task configuration selected despite decoy backup'
 $scope=@{action='request';operation='run_webcore_syntax_check';commit=$state.Current.Commit;sha256=$state.Current.Sha256;expectedCurrentSha256=$state.Current.Sha256}
 $request=Invoke-Operator $scope;Assert ($request.status-eq 'pending') 'independent scoped request queued'
 $unexpected=Invoke-Operator @{action='approve';requestId=('b'*48)};Assert ($unexpected.ok-eq $false) 'forged approval rejected'
 $approved=Invoke-Operator @{action='approve';requestId=$request.requestId}
 Assert ($approved.status-eq 'consumed') 'approval consumed before execution'
 $replay=Invoke-Operator @{action='approve';requestId=$request.requestId};Assert ($replay.ok-eq $false) 'approval replay rejected'
 $completed=Await-Request $request.requestId
 Write-Output ('Restricted worker result: '+($completed|ConvertTo-Json -Compress -Depth 8))
 if(Test-Path "$root\scratch\worker-startup-error.json"){Get-Content "$root\scratch\worker-startup-error.json"|Write-Output}
 Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-Worker'|Select-Object State,@{Name='LogonType';Expression={$_.Principal.LogonType}}|ConvertTo-Json -Compress|Write-Output
 Get-ScheduledTaskInfo -TaskName 'SmartHome-WebCoRE-Worker'|Select-Object LastTaskResult|ConvertTo-Json -Compress|Write-Output
 Assert ($completed.status-eq 'succeeded' -and $completed.result.exitCode-eq 0) 'real restricted-worker syntax execution'
 # Wrong executable cannot use the independent operator channel even with the correct SID.
 $pipe=[IO.Pipes.NamedPipeClientStream]::new('.','SmartHome-WebCoRE-Approval',[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::None,[Security.Principal.TokenImpersonationLevel]::Identification)
 $pipe.Connect(3000);$bytes=[Text.Encoding]::UTF8.GetBytes('{"action":"list"}');$header=[BitConverter]::GetBytes($bytes.Length);$pipe.Write($header,0,4);$pipe.Write($bytes,0,$bytes.Length);$pipe.Flush();$responseHeader=Read-FrameBytes $pipe 4;$responseLength=[BitConverter]::ToInt32($responseHeader,0);Assert ($responseLength-gt 0 -and $responseLength-le 65536) 'bounded denied response';$response=Read-FrameBytes $pipe $responseLength;$pipe.Dispose();Assert ([Text.Encoding]::UTF8.GetString($response).Contains('request_rejected')) 'untrusted executable peer rejected'
 # Add a trusted fixture release that probes actual worker ACLs and spawns a descendant.
 $testCommit='c'*40;$release=Join-Path $root "releases\$testCommit";New-Item -ItemType Directory -Path $release|Out-Null
 [IO.File]::WriteAllText((Join-Path $release 'package.json'),'{"type":"module"}',[Text.UTF8Encoding]::new($false));New-Item -ItemType Directory -Path (Join-Path $release 'test')|Out-Null
 $test=@'
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';import {spawn} from 'node:child_process';
test('worker cannot read credentials or write immutable release',()=>{assert.throws(()=>fs.readFileSync('C:/ProgramData/SmartHome/VmManagement/recovery/canary.txt'));assert.throws(()=>fs.readdirSync('C:/ProgramData/SmartHome/VmManagement/audit'));assert.throws(()=>fs.writeFileSync(new URL('../package.json',import.meta.url),'mutated'));});
test('operator pipe DACL denies actual worker',async()=>{await new Promise((resolve,reject)=>{const socket=net.connect('\\\\.\\pipe\\SmartHome-WebCoRE-Approval');const timer=setTimeout(()=>{socket.destroy();reject(new Error('pipe denial timeout'));},3000);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();reject(new Error('unauthorized operator pipe'));});socket.once('error',()=>{clearTimeout(timer);resolve();});});});
test('descendant containment',()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});fs.writeFileSync('C:/ProgramData/SmartHome/VmManagement/scratch/child-pid.txt',String(child.pid));child.unref();});
'@
 [IO.File]::WriteAllText((Join-Path $release 'test\isolation.test.js'),$test,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText("$root\recovery\canary.txt",'fixture-canary-no-secret',[Text.UTF8Encoding]::new($false))
 $files=[ordered]@{};Get-ChildItem $release -Recurse -File|ForEach-Object{$files[$_.FullName.Substring($release.Length+1).Replace('\','/')]=(Get-FileHash $_.FullName).Hash.ToLowerInvariant()}
 $catalog=@{Commit=$testCommit;Sha256=('d'*64);Root=$release;Files=$files};[IO.File]::WriteAllText("$root\catalog\$testCommit.json",($catalog|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 $scope.operation='run_webcore_tests';$scope.commit=$testCommit;$scope.sha256='d'*64
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') 'actual worker denied protected read and immutable write'
 $childPid=[int](Get-Content "$root\scratch\child-pid.txt")
 Assert (-not(Get-Process -Id $childPid -ErrorAction SilentlyContinue)) 'Job Object killed detached descendant on normal exit'
 # Crash an actual restricted worker while its job has a detached child.
 $crashTest=$test.Replace("child.unref();});","child.unref();setInterval(()=>{},1000);});")
 [IO.File]::WriteAllText((Join-Path $release 'test\isolation.test.js'),$crashTest,[Text.UTF8Encoding]::new($false))
 $catalog.Files['test/isolation.test.js']=(Get-FileHash (Join-Path $release 'test\isolation.test.js')).Hash.ToLowerInvariant()
 [IO.File]::WriteAllText("$root\catalog\$testCommit.json",($catalog|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
 Remove-Item "$root\scratch\child-pid.txt"
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null
 for($i=0;$i-lt 20 -and -not(Test-Path "$root\scratch\child-pid.txt");$i++){Start-Sleep -Seconds 1}
 Assert (Test-Path "$root\scratch\child-pid.txt") 'restricted job child started before crash test'
 $overlap=Invoke-Operator $scope;Assert ($overlap.ok-eq $false) 'concurrent operation denied'
 $childPid=[int](Get-Content "$root\scratch\child-pid.txt")
 Stop-ScheduledTask -TaskName 'SmartHome-WebCoRE-Worker'
 $completed=Await-Request $request.requestId;Assert ($completed.status-eq 'failed') 'worker crash does not retry consumed approval'
 Assert (-not(Get-Process -Id $childPid -ErrorAction SilentlyContinue)) 'worker crash closed job and killed descendant'
 Start-ScheduledTask -TaskName 'SmartHome-WebCoRE-Worker';Start-Sleep -Seconds 3
 $scope.operation='restart_mcp';$scope.commit=$state.Current.Commit;$scope.sha256=$state.Current.Sha256
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') ("controlled service restart: "+($completed.result|ConvertTo-Json -Compress))
 Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($yaml)) -eq [Convert]::ToBase64String($originalYaml)) 'restart preserves exact original YAML bytes'
 $main=Invoke-RestMethod -Uri 'https://api.github.com/repos/cznkane/webcore-CLI/branches/main' -Headers @{'User-Agent'='SmartHome-CI'}
 $commit=[string]$main.commit.sha;$archive=Join-Path $fixture 'merged-release.zip'
 Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/cznkane/webcore-CLI/zip/$commit" -OutFile $archive
 $digest=(Get-FileHash $archive).Hash.ToLowerInvariant()
 $scope.operation='stage_release';$scope.commit=$commit;$scope.sha256=$digest
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') ("merged pinned archive staging: "+($completed.result|ConvertTo-Json -Compress))
 $scope.operation='deploy_release';$request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') ("controlled release deployment: "+($completed.result|ConvertTo-Json -Compress))
 Assert ((Get-Content $yaml -Raw).Contains($commit)) 'deployed pointer persistence'
 $scope.operation='rollback_release';$scope.commit=$state.Current.Commit;$scope.sha256=$state.Current.Sha256;$scope.expectedCurrentSha256=$digest
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') ("verified prior-release rollback: "+($completed.result|ConvertTo-Json -Compress))
 Assert ((Get-Content $yaml -Raw).Contains($state.Current.Commit)) 'rollback pointer persistence'
 $scope.expectedCurrentSha256='e'*64;$stale=Invoke-Operator $scope;Assert ($stale.ok-eq $false) 'stale release approval rejected'
 $events=@(Get-ChildItem "$root\audit\*.jsonl"|Get-Content|ForEach-Object{$_|ConvertFrom-Json})
 Assert (@($events|Where-Object outcome -eq 'succeeded').Count-ge 2) 'durable outcomes recorded'
 Assert (-not((Get-ChildItem "$root\audit\*.jsonl"|Get-Content)-match 'fixture-canary|stdout|password|command:')) 'audit contains metadata only'
 $beforeAuditFailure=Get-Content "$root\state.json" -Raw
 $auditPath="$root\audit";$originalAcl=Get-Acl $auditPath;$deniedAcl=Get-Acl $auditPath
 $deniedAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'Write','ContainerInherit,ObjectInherit','None','Deny'))
 Set-Acl $auditPath $deniedAcl
 $scope.operation='run_webcore_syntax_check';$scope.expectedCurrentSha256=$state.Current.Sha256
 $rejected=$false;try{$unavailable=Invoke-Operator $scope;$rejected=$unavailable.ok-eq $false}catch{$rejected=$true}finally{Set-Acl $auditPath $originalAcl}
 Assert $rejected 'audit write failure prevents request execution'
 Assert ((Get-Content "$root\state.json" -Raw)-eq $beforeAuditFailure) 'audit outage leaves release state unchanged'
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Recover -PackageRoot $package
 Assert ([Convert]::ToBase64String([IO.File]::ReadAllBytes($yaml)) -eq [Convert]::ToBase64String($originalYaml)) 'out-of-band recovery restores exact original YAML bytes'
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Uninstall -PackageRoot $package
 $remainingProfile=Get-CimInstance Win32_UserProfile -Filter "SID='$workerSid'"
 Assert ($null -eq $remainingProfile -or ((Test-Path "$root\recovery\profile-cleanup.json") -and (Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-ProfileCleanup' -ErrorAction SilentlyContinue))) 'profile removed or explicitly scheduled for retirement'
 Assert (-not(Get-LocalUser -Name 'SmartHomeVmWorker' -ErrorAction SilentlyContinue)) 'worker account retired'
 Assert (-not(Test-Path "$root\installed.json")) 'uninstall disables MCP management registration'
 Assert (-not(Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-Management' -ErrorAction SilentlyContinue)) 'uninstall removed only management tasks'
 Assert ((Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP').State-eq 'Running') 'uninstall preserves original runtime'
 Write-Output "WINDOWS INTEGRATION PASS: $Layout"
}finally{
 foreach($name in @('SmartHome-WebCoRE-Management','SmartHome-WebCoRE-Worker','SmartHome-WebCoRE-ProfileCleanup')+$createdTasks){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 Get-Process tunnel-client -ErrorAction SilentlyContinue|Stop-Process -Force
 Remove-NetFirewallRule -Name 'SmartHome-WebCoRE-Worker-NetworkDeny' -ErrorAction SilentlyContinue
 Remove-LocalUser -Name 'SmartHomeVmWorker' -ErrorAction SilentlyContinue
 foreach($backup in @(Get-ChildItem 'C:\ProgramData\SmartHome' -Filter 'runtime-acl-before-*.json' -ErrorAction SilentlyContinue)){Remove-Item -LiteralPath $backup.FullName -Force}
 foreach($dir in @($root,$fixture,$webcore,$package)){if(Test-Path $dir){Remove-Item -LiteralPath $dir -Recurse -Force}}
}
