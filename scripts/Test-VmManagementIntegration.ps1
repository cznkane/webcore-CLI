#Requires -Version 5.1
#Requires -RunAsAdministrator
# Disposable hosted-runner integration only. Never use on TERMINAL.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true' -or $env:COMPUTERNAME -eq 'TERMINAL'){throw 'Disposable GitHub Windows runner required'}
$source=Split-Path $PSScriptRoot -Parent
$root='C:\ProgramData\SmartHome\VmManagement'
$fixture='C:\SmartHome\VmManagementFixture'
$webcore='C:\ProgramData\SmartHome\WebCoRE'
$createdTasks=@()
function Assert($Condition,[string]$Name){if(-not $Condition){throw "FAIL: $Name"};Write-Output "PASS: $Name"}
function Secure([string]$Path){
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner([Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
 foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
 Set-Acl -LiteralPath $Path -AclObject $acl
}
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
 $node=Join-Path $fixture 'node.exe';Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination $node
 $fixtureSource=@'
using System;using System.Threading;using System.IO;using System.Diagnostics;using System.Text.RegularExpressions;
public class FixtureTunnel{public static void Main(string[] args){var text=File.ReadAllText(args[1]).Replace("\\\\","\\");var match=Regex.Match(text,@"[A-Za-z]:\\[^'\r\n]*?\\server\\index\.js");var psi=new ProcessStartInfo{FileName=@"C:\SmartHome\VmManagementFixture\node.exe",Arguments="\""+match.Value+"\"",UseShellExecute=false,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};var child=Process.Start(psi);child.OutputDataReceived+=(s,e)=>{};child.ErrorDataReceived+=(s,e)=>{};child.BeginOutputReadLine();child.BeginErrorReadLine();while(true)Thread.Sleep(1000);}}
'@
 Add-Type -TypeDefinition $fixtureSource -OutputAssembly (Join-Path $fixture 'tunnel-client.exe') -OutputType ConsoleApplication
 $yaml=Join-Path $webcore 'fixture.yaml';[IO.File]::WriteAllText($yaml,"mcp:`n  commands:`n    - command: 'node $payload\server\index.js'`n",[Text.UTF8Encoding]::new($false))
 $principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
 $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
 $trigger=New-ScheduledTaskTrigger -AtStartup
 Register-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP' -Action (New-ScheduledTaskAction -Execute (Join-Path $fixture 'tunnel-client.exe') -Argument "--config $yaml") -Trigger $trigger -Settings $settings -Principal $principal|Out-Null;$createdTasks+='SmartHome-WebCoRE-MCP'
 Register-ScheduledTask -TaskName 'SmartHome-WebCoRE-Watchdog' -Action (New-ScheduledTaskAction -Execute "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument '-NoProfile -NonInteractive -Command exit') -Trigger $trigger -Settings $settings -Principal $principal|Out-Null;$createdTasks+='SmartHome-WebCoRE-Watchdog'
 Start-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP';Start-Sleep -Seconds 2
 $parserErrors=$null;$tokens=$null
 [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'Install-VmManagement.ps1'),[ref]$tokens,[ref]$parserErrors)|Out-Null
 Assert ($parserErrors.Count-eq 0) 'PowerShell installer syntax'
 & "$PSScriptRoot\Package-VmManagement.ps1" -Commit ('a'*40)
 $package=Join-Path $source 'build\package'
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Preflight -PackageRoot $package -NodePath $node -TunnelConfigPath $yaml
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Install -PackageRoot $package -NodePath $node -TunnelConfigPath $yaml
 Start-Sleep -Seconds 3
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Install -PackageRoot $package -NodePath $node -TunnelConfigPath $yaml
 Assert ((Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP').State-eq 'Running') 'installation preserves existing runtime'
 $state=Get-Content "$root\state.json" -Raw|ConvertFrom-Json
 $scope=@{action='request';operation='run_webcore_syntax_check';commit=$state.Current.Commit;sha256=$state.Current.Sha256;expectedCurrentSha256=$state.Current.Sha256}
 $request=Invoke-Operator $scope;Assert ($request.status-eq 'pending') 'independent scoped request queued'
 $unexpected=Invoke-Operator @{action='approve';requestId=('b'*48)};Assert ($unexpected.ok-eq $false) 'forged approval rejected'
 $approved=Invoke-Operator @{action='approve';requestId=$request.requestId}
 Assert ($approved.status-eq 'consumed') 'approval consumed before execution'
 $replay=Invoke-Operator @{action='approve';requestId=$request.requestId};Assert ($replay.ok-eq $false) 'approval replay rejected'
 $completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded' -and $completed.result.exitCode-eq 0) 'real restricted-worker syntax execution'
 # Wrong executable cannot use the independent operator channel even with the correct SID.
 $pipe=[IO.Pipes.NamedPipeClientStream]::new('.','SmartHome-WebCoRE-Approval',[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::None,[Security.Principal.TokenImpersonationLevel]::Identification)
 $pipe.Connect(3000);$bytes=[Text.Encoding]::UTF8.GetBytes('{"action":"list"}');$header=[BitConverter]::GetBytes($bytes.Length);$pipe.Write($header,0,4);$pipe.Write($bytes,0,$bytes.Length);$pipe.Flush();$response=New-Object byte[] 65536;$received=$pipe.Read($response,0,$response.Length);$pipe.Dispose();Assert ($received-gt 0 -and [Text.Encoding]::UTF8.GetString($response,4,$received-4).Contains('request_rejected')) 'untrusted executable peer rejected'
 # Add a trusted fixture release that probes actual worker ACLs and spawns a descendant.
 $testCommit='c'*40;$release=Join-Path $root "releases\$testCommit";New-Item -ItemType Directory -Path $release|Out-Null
 [IO.File]::WriteAllText((Join-Path $release 'package.json'),'{"type":"module"}',[Text.UTF8Encoding]::new($false));New-Item -ItemType Directory -Path (Join-Path $release 'test')|Out-Null
 $test=@'
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {spawn} from 'node:child_process';
test('worker cannot read credentials or write immutable release',()=>{assert.throws(()=>fs.readFileSync('C:/ProgramData/SmartHome/VmManagement/recovery/canary.txt'));assert.throws(()=>fs.writeFileSync(new URL('../package.json',import.meta.url),'mutated'));});
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
 $scope.operation='restart_mcp';$scope.commit=$state.Current.Commit;$scope.sha256=$state.Current.Sha256
 $request=Invoke-Operator $scope;Invoke-Operator @{action='approve';requestId=$request.requestId}|Out-Null;$completed=Await-Request $request.requestId
 Assert ($completed.status-eq 'succeeded') ("controlled service restart: "+($completed.result|ConvertTo-Json -Compress))
 Assert ((Get-Content $yaml -Raw).Contains($payload)) 'restart preserved release pointer'
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
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Recover
 Assert ((Get-Content $yaml -Raw).Contains($payload)) 'out-of-band original configuration recovery'
 & "$PSScriptRoot\Install-VmManagement.ps1" -Mode Uninstall
 Assert (-not(Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-Management' -ErrorAction SilentlyContinue)) 'uninstall removed only management tasks'
 Assert ((Get-ScheduledTask -TaskName 'SmartHome-WebCoRE-MCP').State-eq 'Running') 'uninstall preserves original runtime'
 Write-Output 'WINDOWS INTEGRATION PASS'
}finally{
 foreach($name in @('SmartHome-WebCoRE-Management','SmartHome-WebCoRE-Worker')+$createdTasks){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 Get-Process tunnel-client -ErrorAction SilentlyContinue|Stop-Process -Force
 Remove-NetFirewallRule -Name 'SmartHome-WebCoRE-Worker-NetworkDeny' -ErrorAction SilentlyContinue
 Remove-LocalUser -Name 'SmartHomeVmWorker' -ErrorAction SilentlyContinue
 foreach($dir in @($root,$fixture,$webcore)){if(Test-Path $dir){Remove-Item -LiteralPath $dir -Recurse -Force}}
}
