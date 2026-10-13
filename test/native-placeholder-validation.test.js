import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePiston } from '../server/piston.js';

const placeholder = { g: 'any', t: 'c' };
const comparison = () => ({
  t: 'condition', co: 'changes_to',
  lo: { t: 'p', a: 'switch', d: [] },
  ro: { t: 'c', vt: 'enum', c: 'on', exp: { t: 'expression', i: [{ t: 'string', v: 'on' }] } },
  ro2: structuredClone(placeholder), to: structuredClone(placeholder), to2: structuredClone(placeholder)
});
const body = condition => ({ s: [{ t: 'if', c: [condition], s: [], e: [], ei: [] }], r: [], v: [] });

test('inactive native comparison placeholders are accepted', () => {
  assert.deepEqual(validatePiston(body(comparison()), {}, {}), []);
});

test('active optional comparison operands still require a parsed expression', () => {
  const condition = comparison();
  condition.ro2 = { t: 'c', c: 'true', vt: 'boolean' };
  assert.match(validatePiston(body(condition), {}, {}).join('\n'), /ro2.exp/);
});

test('required comparison operand remains strict', () => {
  const condition = comparison();
  condition.ro = structuredClone(placeholder);
  assert.match(validatePiston(body(condition), {}, {}).join('\n'), /ro.exp/);
});

test('inactive placeholder with an invalid expression is not exempted', () => {
  const condition = comparison();
  condition.to = { ...placeholder, exp: {} };
  assert.match(validatePiston(body(condition), {}, {}).join('\n'), /to.exp/);
});
