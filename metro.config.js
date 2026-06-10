const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const nodeLibs = require('node-libs-react-native');

const config = getDefaultConfig(__dirname);

// Polyfill Node core modules (url, stream, events, etc.) that the `mqtt`
// package imports — Metro doesn't include Node's standard library by default.
config.resolver.extraNodeModules = {
  ...nodeLibs,
  ...config.resolver.extraNodeModules,
};

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'stubs/react-native-maps.js'),
      type: 'sourceFile',
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
