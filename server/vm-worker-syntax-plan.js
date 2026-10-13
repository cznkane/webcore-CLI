// Fixed syntax validation plan, matching package.json's npm run check without a shell.
// Each entry must be invoked as a separate Node process: node --check accepts
// a single script path, not a list of scripts.
export const syntaxCheckFiles = Object.freeze([
  'server/index.js',
  'server/client.js',
  'server/hubitat.js',
  'server/piston.js',
  'server/diagnostics.js',
  'server/selection.js',
  'server/update.js',
  'server/cli.js',
  'server/language.js',
  'server/verification.js',
  'server/windows-management.js'
]);
export function makeSyntaxCheckPlan() {
  return Object.freeze(syntaxCheckFiles.map(file => Object.freeze(['--check', file])));
}
