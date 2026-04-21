const path = require('path');
const { pathToFileURL } = require('url');

module.exports = async function withLlamaRnPlugin(config, props) {
  const packageRoot = path.dirname(require.resolve('llama.rn/package.json'));
  const pluginPath = path.join(packageRoot, 'lib', 'module', 'expo-plugin', 'withLlamaRN.js');
  const pluginModule = await import(pathToFileURL(pluginPath).href);
  return pluginModule.default(config, props);
};