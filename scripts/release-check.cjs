/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const checks = [];
const check = (label, ok) => checks.push({ label, ok: Boolean(ok) });
check('iOS bundle identifier', config.ios?.bundleIdentifier);
check('Android package identifier', config.android?.package);
check(
  'Launcher icon configured and present',
  config.icon && fs.existsSync(path.join(root, config.icon)),
);
for (const name of [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_SUPPORT_URL',
  'EXPO_PUBLIC_DELETION_URL',
]) {
  let valid = false;
  try {
    const url = new URL(process.env[name]);
    valid = url.protocol === 'https:' && !/example|your-project|localhost/.test(url.hostname);
  } catch {
    /* Missing value. */
  }
  check(`${name} configured (URL reachability needs separate verification)`, valid);
}
check(
  'Public Supabase key configured',
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !/your-publishable/.test(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
);
check(
  'Backend baseline recovered',
  fs
    .readdirSync(path.join(root, 'supabase/migrations'))
    .some((name) => /baseline|initial|schema_upgrade/.test(name)),
);
for (const item of checks) process.stdout.write(`${item.ok ? 'PASS' : 'MISSING'} ${item.label}\n`);
process.stdout.write(
  'Manual gates: apply/test migrations in staging, assign moderators, verify OAuth and deletion, configure push credentials/worker, test physical devices, verify legal/support pages, complete store disclosures.\n',
);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
