import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';
const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret', eventCallbackHost: 'events.example.org' };
async function withFetch(fn, run) { const old = globalThis.fetch; globalThis.fetch = fn; try { return await run(); } finally { globalThis.fetch = old; } }
test('mode and HSM mutations require authorization and validate choices', async () => {
  const c = new HubitatClient(config);
  await assert.rejects(c.setMode('1'));
  await assert.rejects(c.setHsm('disarm'));
  await assert.rejects(c.setHsm('armedAway', true));
  await withFetch(async url => ({ ok: true, json: async () => String(url).endsWith('/modes') ? [{ id: 1, name: 'Home' }] : { ok: true } }), async () => {
    assert.equal((await c.setMode('1', true)).mode_name, 'Home');
    await assert.rejects(c.setMode('2', true));
    assert.equal((await c.setHsm('armAway', true)).command, 'armAway');
  });
});
test('multi-argument command validates device and encodes comma-separated values', async () => {
  const paths = [];
  await withFetch(async url => {
    const p = new URL(url).pathname; paths.push(p);
    return { ok: true, json: async () => p.endsWith('/devices') ? [{ id: '664' }] : p.endsWith('/devices/664') ? { commands: [{ command: 'setLevel' }] } : { ok: true } };
  }, async () => {
    const c = new HubitatClient(config);
    await assert.rejects(c.sendDeviceCommandArgs('664', 'setLevel', [40, 2]));
    await assert.rejects(c.sendDeviceCommandArgs('664', 'unlock', [], true));
    await assert.rejects(c.sendDeviceCommandArgs('664', 'setLevel', ['a,b'], true));
    await c.sendDeviceCommandArgs('664', 'setLevel', [40, 2], true);
    assert.equal(paths.at(-1), '/apps/api/1/devices/664/setLevel/40%2C2');
  });
});
test('callback requires explicit approval and preapproved HTTPS host', async () => {
  const c = new HubitatClient(config);
  await assert.rejects(c.setEventCallback('https://events.example.org/hook'));
  await assert.rejects(c.setEventCallback('http://events.example.org/hook', true));
  await assert.rejects(c.setEventCallback('https://other.example.org/hook', true));
  await assert.rejects(c.clearEventCallback());
  await withFetch(async url => ({ ok: true, json: async () => ({ ok: true }) }), async () => {
    assert.equal((await c.setEventCallback('https://events.example.org/hook', true)).configured, true);
    assert.equal((await c.clearEventCallback(true)).configured, false);
  });
});
