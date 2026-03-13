const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Prevents import.meta errors on Expo Web caused by ESM builds in dependencies
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
