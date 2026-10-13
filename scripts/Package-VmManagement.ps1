#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('\A[a-f0-9]{40}\z')][string]$Commit,[string]$OutputDirectory=(Join-Path $PSScriptRoot '..\build\package'))
$ErrorActionPreference='Stop'
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$source=Split-Path $PSScriptRoot -Parent
if(Test-Path -LiteralPath $OutputDirectory){Remove-Item -LiteralPath $OutputDirectory -Recurse -Force}
New-Item -ItemType Directory -Path $OutputDirectory|Out-Null
foreach($dir in @('server','test','.codex-plugin','docs')){Copy-Item -LiteralPath (Join-Path $source $dir) -Destination $OutputDirectory -Recurse}
foreach($file in @('package.json','plugin.json','mcp.json','.mcp.json')){Copy-Item -LiteralPath (Join-Path $source $file) -Destination $OutputDirectory}
New-Item -ItemType Directory -Path (Join-Path $OutputDirectory 'scripts')|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Install-VmManagement.ps1') -Destination (Join-Path $OutputDirectory 'scripts')
New-Item -ItemType Directory -Path (Join-Path $OutputDirectory 'bin')|Out-Null
Copy-Item -LiteralPath (Join-Path $source 'build\vm-management\VmManagement.exe') -Destination (Join-Path $OutputDirectory 'bin')
$files=[ordered]@{}
Get-ChildItem -LiteralPath $OutputDirectory -Recurse -Force -File|Sort-Object FullName|ForEach-Object{$files[$_.FullName.Substring($OutputDirectory.Length+1).Replace('\','/')]=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'vm-package-manifest.json'),(@{Commit=$Commit;Files=$files}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$zip=Join-Path (Split-Path $OutputDirectory -Parent) "SmartHome-VmManagement-$Commit.zip"
if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip}
# .NET ZipFile includes hidden compatibility manifests; Compress-Archive omits them.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($OutputDirectory,$zip)
(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()|Set-Content -LiteralPath "$zip.sha256" -Encoding ASCII
Write-Output $zip
