#Requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][ValidatePattern('\A[a-f0-9]{40}\z')][string]$Commit,[string]$OutputDirectory=(Join-Path $PSScriptRoot '..\build\package'))
$ErrorActionPreference='Stop'
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$source=Split-Path $PSScriptRoot -Parent
if(Test-Path -LiteralPath $OutputDirectory){Remove-Item -LiteralPath $OutputDirectory -Recurse -Force}
New-Item -ItemType Directory -Path $OutputDirectory|Out-Null
foreach($dir in @('server','test','.codex-plugin','docs')){Copy-Item -LiteralPath (Join-Path $source $dir) -Destination $OutputDirectory -Recurse}
foreach($file in @('package.json','plugin.json','mcp.json','.mcp.json','windows-readonly-launcher.cjs')){Copy-Item -LiteralPath (Join-Path $source $file) -Destination $OutputDirectory}
New-Item -ItemType Directory -Path (Join-Path $OutputDirectory 'scripts')|Out-Null
foreach($script in @('Install-VmManagement.ps1','VmWorkerRights.ps1','Remove-WorkerProfile.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $script) -Destination (Join-Path $OutputDirectory 'scripts')}
New-Item -ItemType Directory -Path (Join-Path $OutputDirectory 'bin')|Out-Null
foreach($binary in @('VmManagement.exe','VmManagementApprove.exe')){Copy-Item -LiteralPath (Join-Path $source "build\vm-management\$binary") -Destination (Join-Path $OutputDirectory 'bin')}
$files=[ordered]@{}
Get-ChildItem -LiteralPath $OutputDirectory -Recurse -Force -File|Sort-Object FullName|ForEach-Object{$files[$_.FullName.Substring($OutputDirectory.Length+1).Replace('\','/')]=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'vm-package-manifest.json'),(@{Commit=$Commit;Files=$files}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$zip=Join-Path (Split-Path $OutputDirectory -Parent) "SmartHome-VmManagement-$Commit.zip"
if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip}
# Build the archive explicitly so every entry uses canonical ZIP forward slashes.
# Compress-Archive omits hidden compatibility manifests and .NET Framework's
# CreateFromDirectory emits Windows backslashes.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream=[IO.File]::Open($zip,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
 $zipArchive=[IO.Compression.ZipArchive]::new($zipStream,[IO.Compression.ZipArchiveMode]::Create,$false)
 try{
  Get-ChildItem -LiteralPath $OutputDirectory -Recurse -Force -File|Sort-Object FullName|ForEach-Object{
   $entryName=$_.FullName.Substring($OutputDirectory.Length+1).Replace('\','/')
   [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive,$_.FullName,$entryName,[IO.Compression.CompressionLevel]::Optimal)|Out-Null
  }
 }finally{$zipArchive.Dispose()}
}finally{$zipStream.Dispose()}
(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()|Set-Content -LiteralPath "$zip.sha256" -Encoding ASCII
$setup=Join-Path (Split-Path $OutputDirectory -Parent) "SmartHome-VmManagement-Setup-$Commit.exe"
$setupRelease=Join-Path (Split-Path $OutputDirectory -Parent) 'SetupRelease.cs'
$archiveHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($setupRelease,('namespace SmartHomeSetup { public static class Release { public const string Commit="'+$Commit+'"; public const string ArchiveSha256="'+$archiveHash+'"; } }'),[Text.UTF8Encoding]::new($false))
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$setupSource=Join-Path $source 'windows\VmManagement\Setup.cs'
$setupManifest=Join-Path $source 'windows\VmManagement\Setup.manifest'
& $csc /nologo /target:winexe /platform:x64 /optimize+ /warnaserror+ "/out:$setup" "/win32manifest:$setupManifest" "/resource:$zip,SmartHomePayload.zip" /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll $setupSource $setupRelease
if($LASTEXITCODE -ne 0){throw 'Executable setup compilation failed'}
(Get-FileHash -Algorithm SHA256 -LiteralPath $setup).Hash.ToLowerInvariant()|Set-Content -LiteralPath "$setup.sha256" -Encoding ASCII
Write-Output $zip
Write-Output $setup
