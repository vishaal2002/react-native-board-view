const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const defaults = getDefaultConfig(projectRoot);

module.exports = mergeConfig(defaults, {
  watchFolders: [workspaceRoot],
  resolver: {
    // Workspace packages export their TypeScript sources under the "source" condition.
    unstable_conditionNames: [
      'source',
      ...defaults.resolver.unstable_conditionNames,
    ],
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
  },
});
