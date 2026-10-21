import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };

test('device snapshot combines authorized details and history', async () => {
  const previous = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    const data = path.endsWith('/devices') ? [{ id: '664' }] : path.endsWith('/events') ? [{ name: 'switch', value: 'off' }] : { id: '664', label: 'G-Deck' };
    return { ok: true, json: async () => data };
  };
  try {
    const result = await new HubitatClient(config).getDeviceSnapshot('664', 1);
    assert.equal(result.device.label, 'G-Deck');
    assert.equal(result.history.returned, 1);
    assert.ok(paths.includes('/apps/api/1/devices/664/events'));
  } finally { globalThis.fetch = previous; }
});

test('snapshot refuses unauthorized device without reading details or events', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => [{ id: '665' }] }; };
  try {
    await assert.rejects(new HubitatClient(config).getDeviceSnapshot('664'), { code: 'HUBITAT_DEVICE_NOT_AUTHORIZED' });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});
