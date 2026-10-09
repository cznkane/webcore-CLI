import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHubitatLogs, sanitizeLogMessage, getHubitatLogs } from '../server/hubitat-logs.js';

test('filters by exact device ID and bounds results', () => {
  const rows = [{deviceId:'664',level:'info',timestamp:'2026-10-09T12:00:00Z',message:'off'}, {deviceId:'665',level:'error',timestamp:'2026-10-09T12:01:00Z',message:'timeout'}];
  assert.deepEqual(filterHubitatLogs(rows,{deviceIds:['665'],limit:1}),[{timestamp:'2026-10-09T12:01:00Z',deviceId:'665',level:'error',message:'timeout'}]);
  assert.throws(()=>filterHubitatLogs(rows,{limit:201}),RangeError);
  assert.throws(()=>filterHubitatLogs(rows,{deviceIds:['664/commands/on']}),TypeError);
});

test('redacts secrets and bounds log text', () => {
  const s=sanitizeLogMessage('https://hub.local/logs?access_token=secret&x=1 password: hunter2 Authorization=Bearer');
  assert.doesNotMatch(s,/secret|hunter2/);
  assert.match(s,/REDACTED/);
  assert.equal(sanitizeLogMessage('x'.repeat(3000)).length,2048);
});

test('fails closed until supported Hubitat transport is verified', async () => {
  await assert.rejects(getHubitatLogs(), {code:'HUBITAT_LOG_TRANSPORT_UNAVAILABLE'});
});
