import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSyntaxCheckPlan, syntaxCheckFiles } from '../server/vm-worker-syntax-plan.js';

test('syntax plan matches every file in npm run check, in order', () => {
  const script = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.check;
  const expected = script.split(' && ').map(part => {
    const match = /^node --check (server\/[A-Za-z0-9_-]+\.js)$/.exec(part);
    assert.ok(match, 'package check command must be simple fixed Node syntax check');
    return match[1];
  });
  assert.deepEqual(syntaxCheckFiles, expected);
  assert.deepEqual(makeSyntaxCheckPlan(), expected.map(file => ['--check', file]));
});
