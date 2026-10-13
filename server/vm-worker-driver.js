import { makeSyntaxCheckPlan } from './vm-worker-syntax-plan.js';
import { runFixedNodeOperation } from './vm-worker-process.js';

// Trusted worker-side operation driver; no IPC listener or MCP exposure.
// Requires an independently provisioned restricted identity and a Windows
// process-tree containment mechanism before production use.
export async function performApprovedWorkerOperation(command, config, { run = runFixedNodeOperation } = {}) {
  if (!command || !config || typeof command.operation !== 'string') throw new Error('Trusted worker operation required.');
  const { nodeExecutable, checkoutDirectory, timeoutMs = 30000 } = config;
  const runOne = args => run({
    executable: nodeExecutable,
    expectedExecutable: nodeExecutable,
    cwd: checkoutDirectory,
    args,
    timeoutMs
  });
  if (command.operation === 'run_webcore_tests' && command.executable === 'node.exe' &&
      Array.isArray(command.args) && command.args.length === 1 && command.args[0] === '--test') {
    return runOne(['--test']);
  }
  if (command.operation === 'run_webcore_syntax_check' && command.executable === 'node.exe' &&
      Array.isArray(command.args) && command.args.length === 2 &&
      command.args[0] === '--check' && command.args[1] === 'server/index.js') {
    for (const args of makeSyntaxCheckPlan()) {
      const result = await runOne(args);
      if (result?.ok !== true) return Object.freeze({ ok: false, exitCode: result?.exitCode ?? null });
    }
    return Object.freeze({ ok: true, exitCode: 0 });
  }
  throw new Error('Unapproved worker operation.');
}
