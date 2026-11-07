/* global __dirname */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup({
  environment = 'bare',
  platform = 'ios',
  providerError,
  browserResult = { type: 'success', url: 'rendezwho://auth/callback?code=valid' },
} = {}) {
  const calls = [];
  const client = {
    auth: {
      signInWithOAuth: async (args) => {
        calls.push(['oauth', args]);
        return { data: { url: 'https://provider.example/authorize' }, error: providerError };
      },
      exchangeCodeForSession: async (code) => {
        calls.push(['exchange', code]);
        return { error: null };
      },
    },
  };
  const imports = {
    'expo-constants': {
      __esModule: true,
      default: { executionEnvironment: environment },
      ExecutionEnvironment: { StoreClient: 'storeClient' },
    },
    'react-native': { Platform: { OS: platform } },
    './supabase': { database: () => client },
    'expo-auth-session': { makeRedirectUri: () => 'rendezwho://auth/callback' },
    'expo-web-browser': {
      maybeCompleteAuthSession() {},
      openAuthSessionAsync: async () => {
        calls.push(['browser']);
        return browserResult;
      },
    },
  };
  const context = { exports: {}, require: (name) => imports[name], URL, Map, setTimeout() {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(require('node:path').join(__dirname, '../src/lib/auth.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    context,
  );
  return { api: context.exports, calls };
}
test('disabled provider gives an actionable error without opening a browser', async () => {
  const { api, calls } = setup({
    providerError: { message: 'Unsupported provider: provider is not enabled' },
  });
  await assert.rejects(api.signInWithProvider('google'), /Google sign-in is not available/);
  assert.equal(calls.length, 1);
});
test('Expo Go stops before starting an OAuth request', async () => {
  const { api, calls } = setup({ environment: 'storeClient' });
  await assert.rejects(api.signInWithProvider('google'), /development build/);
  assert.equal(calls.length, 0);
});
test('web sign-in remains available outside a native development build', async () => {
  const { api, calls } = setup({ environment: 'storeClient', platform: 'web' });
  await api.signInWithProvider('google');
  assert.equal(calls.filter((c) => c[0] === 'exchange').length, 1);
});
test('successful social login redeems the code once across callback races', async () => {
  const { api, calls } = setup();
  await api.signInWithProvider('apple');
  await api.exchangeCode('valid');
  assert.equal(calls.filter((c) => c[0] === 'exchange').length, 1);
  assert.equal(calls[0][1].options.redirectTo, 'rendezwho://auth/callback');
});
test('cancelled social login never exchanges a code', async () => {
  const { api, calls } = setup({ browserResult: { type: 'cancel' } });
  await api.signInWithProvider('google');
  assert.equal(calls.filter((c) => c[0] === 'exchange').length, 0);
});
test('missing authorization code cannot silently report successful login', async () => {
  const { api } = setup({ browserResult: { type: 'success', url: 'rendezwho://auth/callback' } });
  await assert.rejects(api.signInWithProvider('google'), /authorization code/);
});
test('provider rejection preserves the reason', async () => {
  const { api } = setup({
    browserResult: {
      type: 'success',
      url: 'rendezwho://auth/callback?error_description=Access%20denied',
    },
  });
  await assert.rejects(api.signInWithProvider('google'), /Access denied/);
});
