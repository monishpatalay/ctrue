// Without an Apple Developer certificate electron-builder leaves Electron's stock signature in place, which does
// not cover Ctrue's own files. macOS then calls the downloaded app "damaged" and offers no way to open it.
// A valid ad-hoc signature over the whole bundle turns that into the normal "unverified developer" prompt,
// which users can approve under System Settings > Privacy & Security > Open Anyway.
// Skipped when a real signing identity is configured (CSC_LINK or CSC_NAME), which signs and notarizes properly.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
