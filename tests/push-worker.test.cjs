/* global __dirname, Request, Response, AbortSignal */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function setup(ticket = { status: 'ok', id: 'ticket-1' }) {
  let handler;
  const calls = [];
  const client = {
    from(table) {
      const chain = {
        then(ok) {
          return Promise.resolve({ data: [], error: null }).then(ok);
        },
      };
      for (const method of ['select', 'not', 'is', 'lt', 'limit', 'update', 'eq', 'delete'])
        chain[method] = (...args) => {
          calls.push({ table, method, args });
          return chain;
        };
      return chain;
    },
    async rpc() {
      return {
        data: [
          {
            delivery_id: 'job',
            token: 'ExpoPushToken[private]',
            notification_id: 'notification',
            user_id: 'user',
            kind: 'message',
            target_id: 'chat',
          },
        ],
        error: null,
      };
    },
  };
  const context = {
    exports: {},
    require: () => ({
      createClient: () => {
        calls.push({ client: true });
        return client;
      },
    }),
    Deno: {
      env: { get: (name) => (name === 'PUSH_WORKER_SECRET' ? 'secret' : 'configured') },
      serve: (fn) => {
        handler = fn;
      },
    },
    Response,
    AbortSignal,
    Date,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return Response.json({ data: [ticket] });
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        path.join(__dirname, '../supabase/functions/deliver-notifications/index.ts'),
        'utf8',
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  return { handler, calls };
}
test('push worker rejects unauthorized callers before accessing service credentials', async () => {
  const { handler, calls } = setup();
  const response = await handler(new Request('https://worker.test', { method: 'POST' }));
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
test('push worker sends generic content and records successful tickets', async () => {
  const { handler, calls } = setup();
  const response = await handler(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    }),
  );
  assert.equal(response.status, 200);
  const sent = calls.find((c) => c.url).body[0];
  assert.equal(sent.body, 'You have an update in your travel network.');
  assert.equal(sent.data.userId, 'user');
  assert.ok(calls.some((c) => c.method === 'update' && c.args[0].ticket === 'ticket-1'));
});
test('push worker removes unregistered devices', async () => {
  const { handler, calls } = setup({ status: 'error', details: { error: 'DeviceNotRegistered' } });
  const response = await handler(
    new Request('https://worker.test', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    }),
  );
  assert.equal(response.status, 200);
  assert.ok(calls.some((c) => c.table === 'app_push_devices' && c.method === 'delete'));
});
