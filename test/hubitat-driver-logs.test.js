import test from 'node:test';
import assert from 'node:assert/strict';
import { HubitatClient } from '../server/hubitat.js';

const base = { baseUrl: 'http://hub.local', appId: '1', accessToken: 'secret' };
test('driver log access defaults to disabled and makes no request', async () => {
  const c = new HubitatClient(base);
  await assert.rejects(c.getDriverLogs(), { code: 'HUBITAT_LOGS_DISABLED' });
});
test('reads and filters real historical driver logs without sending Maker API token', async () => {
  const prior = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url, init) => {
    paths.push(new URL(url).pathname);
    if (String(url).endsWith('/devices')) return { ok: true, json: async () => [{ id: '664' }] };
    assert.equal(init.headers.Authorization, undefined);
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify([
      '2026-10-21 12:00:00.000\tINFO \tdev|664|G-Deck|switch off',
      '2026-10-21 12:00:01.000\tWARN \tdev|665|UpperDeck|timeout'
    ]) };
  };
  try {
    const c = new HubitatClient({ ...base, logsEnabled: true });
    const result = await c.getDriverLogs({ deviceId: '664', limit: 10 });
    assert.equal(result.historical_only, true);
    assert.equal(result.returned, 1);
    assert.equal(result.entries[0].id, '664');
    assert.deepEqual(paths, ['/apps/api/1/devices', '/logs/past/json']);
  } finally { globalThis.fetch = prior; }
});
test('rejects invalid log filters before fetching', async () => {
  const c = new HubitatClient({ ...base, logsEnabled: true });
  await assert.rejects(c.getDriverLogs({ limit: 501 }));
  await assert.rejects(c.getDriverLogs({ deviceId: '../1' }));
  await assert.rejects(c.getDriverLogs({ level: 'fatal' }));
});
