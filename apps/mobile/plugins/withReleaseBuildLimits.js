const { withAppBuildGradle } = require('expo/config-plugins');
const MARK = '// clockin-release-packager-single-worker';
module.exports = function withReleaseBuildLimits(config) {
  return withAppBuildGradle(config, mod => {
    if (!mod.modResults.contents.includes(MARK)) mod.modResults.contents += '\n' + MARK + '\nreact { extraPackagerArgs = ["--max-workers", "1"] }\n';
    return mod;
  });
};
