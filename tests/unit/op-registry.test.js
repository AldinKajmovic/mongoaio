const test = require('node:test');
const assert = require('node:assert/strict');
const { beginOp, cancelOp, resolveTimeout } = require('../../src/db/op-registry');
const { QUERY_TIMEOUT_DEFAULT_MS, QUERY_TIMEOUT_MAX_MS } = require('../../src/db/constants');

function fakeClient(inprog = [{ opid: 11 }, { opid: 12 }]) {
  const calls = [];
  return {
    calls,
    db: () => ({
      command: async (cmd) => {
        calls.push(cmd);
        if (cmd.currentOp) return { inprog };
        return { ok: 1 };
      },
    }),
  };
}

test('resolveTimeout clamps to the supported range', () => {
  assert.equal(resolveTimeout(undefined), QUERY_TIMEOUT_DEFAULT_MS);
  assert.equal(resolveTimeout(-1), QUERY_TIMEOUT_DEFAULT_MS);
  assert.equal(resolveTimeout('abc'), QUERY_TIMEOUT_DEFAULT_MS);
  assert.equal(resolveTimeout(5000), 5000);
  assert.equal(resolveTimeout(10 * QUERY_TIMEOUT_MAX_MS), QUERY_TIMEOUT_MAX_MS);
});

test('an op without an id is not cancellable and costs nothing', () => {
  const op = beginOp(undefined, fakeClient());
  assert.equal(op.signal, undefined);
  assert.equal(op.comment, undefined);
  op.end();
});

test('cancel aborts the signal and kills the tagged server ops', async () => {
  const client = fakeClient();
  const op = beginOp('abc', client);
  assert.equal(op.comment, 'mongoaio:abc');
  const res = await cancelOp('abc');
  assert.deepEqual(res, { cancelled: true, killed: 2 });
  assert.ok(op.signal.aborted);
  assert.match(op.signal.reason.message, /cancelled/);
  const kills = client.calls.filter(c => c.killOp).map(c => c.op);
  assert.deepEqual(kills, [11, 12]);
});

test('cancelling an unknown or finished op is a no-op', async () => {
  assert.deepEqual(await cancelOp('nope'), { cancelled: false });
  const op = beginOp('done', fakeClient());
  op.end();
  assert.deepEqual(await cancelOp('done'), { cancelled: false });
});

test('cancel still aborts when the server refuses currentOp', async () => {
  const client = { db: () => ({ command: async () => { throw new Error('not authorized'); } }) };
  const op = beginOp('noauth', client);
  const res = await cancelOp('noauth');
  assert.equal(res.cancelled, true);
  assert.ok(op.signal.aborted);
});
