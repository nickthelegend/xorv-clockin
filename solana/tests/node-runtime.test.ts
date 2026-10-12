import { test } from 'node:test';
import assert from 'node:assert/strict';
import { concurrencyLimit, resultBytes, submitAnswer } from '../node/runtime.ts';

test('providers run one model job by default; bounded overrides are allowed', () => {
  assert.equal(concurrencyLimit(), 1);
  assert.equal(concurrencyLimit('4'), 4);
  for (const input of ['0', '-1', '1.5', 'Infinity', '9', 'invalid', '']) {
    assert.throws(() => concurrencyLimit(input), /XORV_MAX_CONCURRENT_JOBS/);
  }
});
test('empty model replies trigger the existing reject/refund path', () => {
  for (const answer of ['', '  \n\t']) assert.throws(() => resultBytes(answer), /empty answer/);
  assert.equal(resultBytes('  A useful reply \n').toString(), 'A useful reply');
});
test('account-sized output preserves emoji and multibyte UTF-8', () => {
  for (const answer of ['a'.repeat(3000), '🦄'.repeat(1000), 'नमस्ते'.repeat(1000)]) {
    const bytes = resultBytes(answer);
    assert.ok(bytes.length <= 2048);
    assert.ok(bytes.toString('utf8').endsWith('\n…[truncated]'));
    assert.ok(!bytes.toString('utf8').includes('\ufffd'));
    assert.deepEqual(Buffer.from(bytes.toString('utf8')), bytes);
  }
});

test('chunk delivery sends the final flag only on the last successful chunk', async () => {
  const calls: { data: Buffer; done: boolean }[] = [];
  const bytes = await submitAnswer('a'.repeat(1600), async (data, done) => { calls.push({ data, done }); }, new AbortController().signal);
  assert.equal(bytes, 1600);
  assert.deepEqual(calls.map((c) => [c.data.length, c.done]), [[700, false], [700, false], [200, true]]);
  assert.equal(Buffer.concat(calls.map((c) => c.data)).toString(), 'a'.repeat(1600));
});
test('an adapter that returns after cancellation cannot settle a job', async () => {
  const ctrl = new AbortController(); ctrl.abort();
  let called = false;
  await assert.rejects(submitAnswer('late answer', async () => { called = true; }, ctrl.signal), /deadline/);
  assert.equal(called, false);
});
test('cancellation or a chunk failure prevents a paid final chunk', async () => {
  for (const failure of ['abort', 'rpc']) {
    const ctrl = new AbortController(); let calls = 0;
    await assert.rejects(submitAnswer('a'.repeat(1600), async (_chunk, done) => {
      calls++; assert.equal(done, false);
      if (failure === 'rpc') throw new Error('RPC failed');
      ctrl.abort();
    }, ctrl.signal));
    assert.equal(calls, 1);
  }
});
