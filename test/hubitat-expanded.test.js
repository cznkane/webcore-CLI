import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };
function mocked(fn, run) {
  const prior = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve().then(run).finally(() => { globalThis.fetch = prior; });
}
test('expanded Maker API read endpoints use bearer authentication', async () => {
  const paths = [];
  await mocked(async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(options.method, 'GET');
    const path = new URL(url).pathname;
    const payload = path.endsWith('/devices/all') ? [{ id: '664' }] :
      path.endsWith('/devices') ? [{ id: '664' }] :
      path.endsWith('/devices/664') ? { id: '664', attributes: [{ name: 'switch' }], commands: [{ command: 'off' }] } :
      path.endsWith('/devices/664/commands') ? [{ command: 'off' }] :
      path.endsWith('/hsm') ? { status: 'disarmed' } : { value: 'off' };
    return { ok: true, json: async () => payload };
  }, async () => {
    const c = new HubitatClient(config);
    assert.equal((await c.listDeviceDetails())[0].id, '664');
    assert.equal((await c.getDeviceCommands('664'))[0].command, 'off');
    assert.deepEqual(await c.getDeviceAttribute('664', 'switch'), { value: 'off' });
    assert.equal((await c.getHsmStatus()).status, 'disarmed');
    assert.ok(paths.includes('/apps/api/1/devices/664/attribute/switch'));
  });
});
test('live command requires authorization and excludes lock and PIN operations', async () => {
  const c = new HubitatClient(config);
  await assert.rejects(c.sendDeviceCommand('664', 'off'));
  await assert.rejects(c.sendDeviceCommand('664', 'unlock', undefined, true));
  await assert.rejects(c.sendDeviceCommand('664', 'setCode', '1234', true));
  await assert.rejects(c.sendDeviceCommand('664', 'setLevel', { level: 10 }, true));
});
test('live command checks Maker API device scope and advertised command', async () => {
  const paths = [];
  await mocked(async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    const payload = path.endsWith('/devices') ? [{ id: '664' }] :
      path.endsWith('/devices/664') ? { commands: [{ command: 'setLevel' }] } : { ok: true };
    return { ok: true, json: async () => payload };
  }, async () => {
    const c = new HubitatClient(config);
    await assert.rejects(c.sendDeviceCommand('665', 'setLevel', 40, true), { code: 'HUBITAT_DEVICE_NOT_AUTHORIZED' });
    await assert.rejects(c.sendDeviceCommand('664', 'off', undefined, true));
    const result = await c.sendDeviceCommand('664', 'setLevel', 40, true);
    assert.equal(result.command, 'setLevel');
    assert.equal(paths.at(-1), '/apps/api/1/devices/664/setLevel/40');
  });
});
