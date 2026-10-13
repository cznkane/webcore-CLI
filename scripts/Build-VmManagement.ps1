#Requires -Version 5.1
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\build\vm-management'))
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $csc)){throw '.NET Framework 4.x compiler missing'}
$source=Join-Path $PSScriptRoot '..\windows\VmManagement'
& $csc /nologo /target:exe /platform:x64 /optimize+ /warnaserror+ "/out:$OutputDirectory\VmManagement.exe" /r:System.Web.Extensions.dll /r:System.Net.Http.dll /r:System.Management.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:Microsoft.CSharp.dll "$source\Common.cs" "$source\Job.cs" "$source\Host.cs" "$source\SelfTest.cs"
if($LASTEXITCODE -ne 0){throw 'Management host compilation failed'}
& $csc /nologo /target:winexe /platform:x64 /optimize+ /warnaserror+ "/out:$OutputDirectory\VmManagementApprove.exe" /r:System.Windows.Forms.dll "$source\OperatorLauncher.cs"
if($LASTEXITCODE -ne 0){throw 'Approval launcher compilation failed'}
Get-FileHash -Algorithm SHA256 -LiteralPath "$OutputDirectory\VmManagement.exe"
