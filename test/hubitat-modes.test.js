import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };

test('lists Hubitat modes and reads current mode without mutation', async () => {
  const original = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.method, 'GET');
    return { ok: true, json: async () => String(url).endsWith('/modes') ? [{ id: 1, name: 'Home' }] : { id: 1, name: 'Home' } };
  };
  try {
    const client = new HubitatClient(config);
    assert.equal((await client.listModes())[0].name, 'Home');
    assert.equal((await client.getCurrentMode()).name, 'Home');
    assert.deepEqual(paths, ['/apps/api/1/modes', '/apps/api/1/mode']);
  } finally { globalThis.fetch = original; }
});

test('rejects malformed mode responses', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => 'invalid' });
  try {
    const client = new HubitatClient(config);
    await assert.rejects(client.listModes(), { code: 'HUBITAT_MODES_UNSUPPORTED' });
    await assert.rejects(client.getCurrentMode(), { code: 'HUBITAT_MODE_UNSUPPORTED' });
  } finally { globalThis.fetch = original; }
});
