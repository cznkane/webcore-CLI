import { execFile } from 'node:child_process';
import { platform } from 'node:os';

const TASKS = ['SmartHome-WebCoRE-MCP', 'SmartHome-WebCoRE-Watchdog'];
const ROOT = 'C:\\SmartHome\\webcore-CLI';
const scripts = Object.freeze({
  vm_status: "$os=Get-CimInstance Win32_OperatingSystem; [pscustomobject]@{computer=$env:COMPUTERNAME;os=$os.Caption;boot=$os.LastBootUpTime;freeMemoryKB=$os.FreePhysicalMemory;totalMemoryKB=$os.TotalVisibleMemorySize;systemDriveFreeBytes=(Get-PSDrive C).Free} | ConvertTo-Json -Compress",
  vm_scheduled_tasks: "$names=@('SmartHome-WebCoRE-MCP','SmartHome-WebCoRE-Watchdog'); @($names | ForEach-Object { $name=$_; $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue; if($task){$info=$task | Get-ScheduledTaskInfo; [pscustomobject]@{name=$name;state=[string]$task.State;lastRun=$info.LastRunTime;nextRun=$info.NextRunTime;lastResult=$info.LastTaskResult}} else {[pscustomobject]@{name=$name;state='NotFound'}} }) | ConvertTo-Json -Compress",
  vm_processes: "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('node.exe','tunnel-client.exe') } | Select-Object Name,ProcessId,ParentProcessId,CreationDate) | ConvertTo-Json -Compress",
  vm_git_status: "$repo='C:\\SmartHome\\webcore-CLI'; if(-not (Test-Path -LiteralPath $repo -PathType Container)){throw 'Repository directory unavailable'}; $branch=git -C $repo branch --show-current; $commit=git -C $repo rev-parse HEAD; $changes=git -C $repo status --porcelain; if($LASTEXITCODE -ne 0){throw 'Git status failed'}; [pscustomobject]@{branch=$branch;commit=$commit;clean=(@($changes).Count -eq 0);changedCount=@($changes).Count} | ConvertTo-Json -Compress"
});

export const managementToolNames = Object.freeze(Object.keys(scripts));
export function managementAvailable(env = process.env, os = platform()) {
  return os === 'win32' && env.WEBCORE_WINDOWS_MANAGEMENT_READONLY === 'enabled';
}
export async function runManagementReadOnly(name, { env = process.env, os = platform(), runner = execFile } = {}) {
  if (!Object.hasOwn(scripts, name)) throw new Error('Unknown management operation.');
  if (!managementAvailable(env, os)) throw new Error('Windows management diagnostics are not enabled on this runtime.');
  const output = await new Promise((resolve, reject) => {
    runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', scripts[name]], {
      windowsHide: true, timeout: 8000, maxBuffer: 65536, env
    }, (error, stdout) => error ? reject(new Error('Windows diagnostic operation failed.')) : resolve(stdout));
  });
  if (output.length > 65536) throw new Error('Diagnostic output exceeded the permitted limit.');
  try { return { operation: name, read_only: true, result: JSON.parse(output) }; }
  catch { throw new Error('Windows diagnostic returned invalid structured output.'); }
}

// Test execution is intentionally NOT available in the privileged MCP service.
// Running repository-controlled npm scripts as SYSTEM would cross the trust boundary.
// A separate least-privilege worker with immutable release verification is required.
export const managementTestToolNames = Object.freeze([]);
export function managementTestsAvailable() { return false; }
export async function runManagementTest() {
  throw new Error('VM test execution unavailable: isolated, verified worker not commissioned.');
}
