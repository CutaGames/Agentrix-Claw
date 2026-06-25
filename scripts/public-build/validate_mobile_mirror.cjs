const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(repoRoot, 'scripts', 'public-build', 'mobile_mirror_paths.txt');
const appJsonPath = path.join(repoRoot, 'app.json');

function fail(message) {
  console.error(`[public-build] ${message}`);
  process.exit(1);
}

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    fail(`mirror manifest missing: ${manifestPath}`);
  }

  return fs
    .readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function existsRelative(relPath) {
  return fs.existsSync(path.join(repoRoot, relPath));
}

function resolveRelativeModule(specifier) {
  const normalized = specifier.replace(/^\.\//, '');
  const candidates = [
    normalized,
    `${normalized}.js`,
    `${normalized}.cjs`,
    `${normalized}.mjs`,
    `${normalized}.json`,
    path.join(normalized, 'index.js'),
    path.join(normalized, 'index.cjs'),
    path.join(normalized, 'index.mjs'),
  ];

  for (const candidate of candidates) {
    if (existsRelative(candidate)) {
      return candidate.replace(/\\/g, '/');
    }
  }

  return null;
}

function manifestCovers(manifestEntries, relFilePath) {
  return manifestEntries.some((entry) => {
    const normalizedEntry = entry.replace(/\\/g, '/').replace(/\/\*\*$/, '');
    return relFilePath === normalizedEntry || relFilePath.startsWith(`${normalizedEntry}/`);
  });
}

function getRelativePlugins(appJson) {
  const plugins = appJson?.expo?.plugins;
  if (!Array.isArray(plugins)) return [];

  return plugins
    .map((plugin) => {
      if (typeof plugin === 'string') return plugin;
      if (Array.isArray(plugin) && typeof plugin[0] === 'string') return plugin[0];
      return null;
    })
    .filter((plugin) => plugin && plugin.startsWith('./'));
}

const manifestEntries = readManifest();
const missingManifestPaths = manifestEntries.filter((entry) => !existsRelative(entry));
if (missingManifestPaths.length > 0) {
  fail(`mirror manifest contains missing path(s): ${missingManifestPaths.join(', ')}`);
}

if (!fs.existsSync(appJsonPath)) {
  fail(`app.json missing: ${appJsonPath}`);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const relativePlugins = getRelativePlugins(appJson);
for (const plugin of relativePlugins) {
  const resolvedPlugin = resolveRelativeModule(plugin);
  if (!resolvedPlugin) {
    fail(`app.json references missing local Expo plugin: ${plugin}`);
  }
  if (!manifestCovers(manifestEntries, resolvedPlugin)) {
    fail(`mirror manifest does not include local Expo plugin required by app.json: ${resolvedPlugin}`);
  }
}

console.log(`[public-build] mirror validation passed (${manifestEntries.length} paths, ${relativePlugins.length} local plugin(s))`);
