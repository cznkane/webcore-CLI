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

const testOperations = Object.freeze({
  vm_run_webcore_tests: ['test'],
  vm_run_webcore_syntax_check: ['run', 'check']
});
export const managementTestToolNames = Object.freeze(Object.keys(testOperations));
export function managementTestsAvailable(env = process.env, os = platform()) {
  return os === 'win32' && env.WEBCORE_WINDOWS_MANAGEMENT_TESTS === 'enabled';
}
export async function runManagementTest(name, { confirm, env = process.env, os = platform(), runner = execFile } = {}) {
  if (!Object.hasOwn(testOperations, name)) throw new Error('Unknown VM test operation.');
  if (!managementTestsAvailable(env, os)) throw new Error('VM test execution is disabled.');
  if (confirm !== true) throw new Error('Explicit VM test approval is required.');
  const args = testOperations[name];
  const output = await new Promise((resolve, reject) => {
    runner('npm.cmd', args, {
      cwd: ROOT, shell: false, windowsHide: true, timeout: 120000,
      maxBuffer: 65536, env
    }, (error, stdout, stderr) => {
      if (error?.code === 'ENOENT') return reject(new Error('Approved test executable or checkout unavailable.'));
      resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout, stderr, timedOut: error?.killed === true });
    });
  });
  const sanitize = value => String(value).replace(/https?:[^ ]+/gi, '[REDACTED_URL]').replace(/(token|password|secret|api[_-]?key)[^ ]{0,100}/gi, '[REDACTED_SECRET]').slice(0, 12000);
  return { operation: name, execution: 'approved_allowlist', exit_code: output.exitCode, timed_out: output.timedOut, stdout: sanitize(output.stdout), stderr: sanitize(output.stderr) };
}
