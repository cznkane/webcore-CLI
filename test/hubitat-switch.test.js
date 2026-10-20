import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };

test('rejects unapproved physical commands before network access', async () => {
  const client = new HubitatClient(config);
  await assert.rejects(client.setSwitch('664', 'off', false), { code: 'HUBITAT_COMMAND_NOT_AUTHORIZED' });
  await assert.rejects(client.setSwitch('../664', 'off', true));
  await assert.rejects(client.setSwitch('664', 'unlock', true));
});

test('validates device scope and supported commands before executing', async () => {
  const previous = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.endsWith('/devices')) return { ok: true, json: async () => [{ id: '664' }] };
    if (path.endsWith('/devices/664')) return { ok: true, json: async () => ({ commands: [{ command: 'on' }, { command: 'off' }] }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  try {
    const client = new HubitatClient(config);
    await assert.rejects(client.setSwitch('665', 'off', true), { code: 'HUBITAT_DEVICE_NOT_AUTHORIZED' });
    assert.deepEqual(paths, ['/apps/api/1/devices']);
    const response = await client.setSwitch('664', 'off', true);
    assert.equal(response.command, 'off');
    assert.equal(response.device_id, '664');
    assert.equal(paths.at(-1), '/apps/api/1/devices/664/off');
  } finally {
    globalThis.fetch = previous;
  }
});

test('rejects unsupported command without sending it', async () => {
  const previous = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return { ok: true, json: async () => path.endsWith('/devices') ? [{ id: '664' }] : { commands: [{ command: 'on' }] } };
  };
  try {
    await assert.rejects(new HubitatClient(config).setSwitch('664', 'off', true), { code: 'HUBITAT_COMMAND_UNSUPPORTED' });
    assert.equal(paths.length, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
