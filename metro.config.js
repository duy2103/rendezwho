const { getDefaultConfig } = require('expo/metro-config');
const { copyFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');

// Metro does not emit MapLibre's separate ESM worker. Expo serves public/ in
// development and copies it into web exports. Keep it in sync on every start.
const maplibreDist = path.dirname(require.resolve('maplibre-gl/package.json'));
const workerDirectory = path.join(__dirname, 'public', 'maplibre');
mkdirSync(workerDirectory, { recursive: true });
for (const filename of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(maplibreDist, 'dist', filename), path.join(workerDirectory, filename));
}

module.exports = getDefaultConfig(__dirname);
