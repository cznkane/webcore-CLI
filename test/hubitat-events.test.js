import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const config = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };
function withFetch(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return Promise.resolve().then(run).finally(() => { globalThis.fetch = original; });
}
function mockFetch(events, options = {}) {
  const paths = [];
  const fn = async (url, init) => {
    paths.push(new URL(url).pathname);
    assert.equal(init.headers.Authorization, 'Bearer secret');
    if (String(url).endsWith('/devices')) return { ok: true, json: async () => [{ id: '665' }] };
    return options.status ? { ok: false, status: options.status, statusText: 'Not Found' } :
      { ok: true, json: async () => events };
  };
  return { fn, paths };
}
test('reads authorized device event history and bounds output', async () => {
  const m = mockFetch([{ name: 'switch', value: 'off' }, { name: 'switch', value: 'on' }]);
  await withFetch(m.fn, async () => {
    const result = await new HubitatClient(config).getDeviceEvents('665', 1);
    assert.equal(result.returned, 1);
    assert.equal(result.truncated, true);
    assert.equal(result.events[0].value, 'off');
    assert.deepEqual(m.paths, ['/apps/api/1/devices', '/apps/api/1/devices/665/events']);
  });
});
test('rejects unauthorized devices without requesting their events', async () => {
  const m = mockFetch([]);
  await withFetch(m.fn, async () => {
    await assert.rejects(new HubitatClient(config).getDeviceEvents('671'), { code: 'HUBITAT_DEVICE_NOT_AUTHORIZED' });
    assert.equal(m.paths.length, 1);
  });
});
test('rejects invalid IDs and limits', async () => {
  const client = new HubitatClient(config);
  await assert.rejects(client.getDeviceEvents('../665'));
  await assert.rejects(client.getDeviceEvents('665', 101));
});
test('rejects unrecognized event payload', async () => {
  const m = mockFetch({ status: 'unknown' });
  await withFetch(m.fn, () => assert.rejects(new HubitatClient(config).getDeviceEvents('665'), { code: 'HUBITAT_EVENTS_UNSUPPORTED' }));
});
test('surfaces unsupported endpoint errors', async () => {
  const m = mockFetch([], { status: 404 });
  await withFetch(m.fn, () => assert.rejects(new HubitatClient(config).getDeviceEvents('665'), { code: 'HUBITAT_API_ERROR' }));
});
