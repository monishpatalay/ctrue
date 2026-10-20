import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import asar from '@electron/asar';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';

// Checks a built macOS release before it is published, and with --published what users actually download.
// One wrong build (ad hoc signature, localhost URL, a feed that does not match its files) silently breaks updates or
// macOS permissions for every installed copy, so each of these is a hard failure.
// Expected values default to production and follow the same variables as the build.
const desktop = 'apps/desktop', release = join(desktop, 'release'), app = join(release, 'mac-arm64/Ctrue.app');
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version;
const expected = {
  cert: (process.env.CTRUE_SIGN_IDENTITY || 'CEEFE3EC7734E8C8DDA6293FBC4F6FE94709EC3F').toLowerCase(),
  api: process.env.CTRUE_API_URL || 'https://api.ctrue.monishpatalay.dev',
  website: process.env.CTRUE_WEBSITE_URL || 'https://ctrue.monishpatalay.dev',
  feed: (process.env.CTRUE_UPDATE_FEED_URL || 'https://github.com/monishpatalay/ctrue/releases/latest/download/').replace(/\/?$/, '/'),
};
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✖'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); };
const run = (command, args) => { const result = spawnSync(command, args, { encoding: 'utf8' }); return { ok: result.status === 0, out: `${result.stdout || ''}${result.stderr || ''}` }; };
const sha512 = file => createHash('sha512').update(readFileSync(file)).digest('base64');
// electron-builder's latest-mac.yml: top-level version plus files of url/sha512/size.
const feedFiles = text => ({ version: text.match(/^version: (.+)$/m)?.[1].trim(), files: [...text.matchAll(/- url: (.+)\n\s+sha512: (.+)\n\s+size: (\d+)/g)].map(([, url, hash, size]) => ({ url: url.trim(), sha512: hash.trim(), size: Number(size) })) });

if (!existsSync(app)) { console.error(`No build at ${app}. Run npm run package:mac with the release variables first.`); process.exit(1); }
console.log(`Ctrue ${version}: ${app}`);

// Signature: the same certificate on every build keeps updates and Screen Recording permission working.
const requirement = run('codesign', ['-dr', '-', app]).out;
check(`signed by the release certificate ${expected.cert.slice(0, 8)}…`, requirement.includes(`certificate leaf = H"${expected.cert}"`), requirement.match(/designated => .*/)?.[0] || 'unsigned or ad hoc');
check('signature verifies (deep, strict)', run('codesign', ['--verify', '--deep', '--strict', app]).ok);

// Info.plist: version, identity, the permission prompts and the sign-in link scheme.
const plist = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]).out);
check(`bundle version is ${version}`, plist.CFBundleShortVersionString === version, plist.CFBundleShortVersionString);
check('bundle id is dev.ctrue.desktop', plist.CFBundleIdentifier === 'dev.ctrue.desktop', plist.CFBundleIdentifier);
for (const key of ['NSMicrophoneUsageDescription', 'NSAudioCaptureUsageDescription', 'NSScreenCaptureUsageDescription']) check(`${key} is set`, !!plist[key]);
check('handles ctrue:// sign-in links', (plist.CFBundleURLTypes || []).some(type => type.CFBundleURLSchemes?.includes('ctrue')));

// The service addresses baked into the main process at build time, and the renderer's CSP.
const archive = join(app, 'Contents/Resources/app.asar');
const main = asar.extractFile(archive, 'dist-electron/main.cjs').toString();
const baked = pattern => main.match(pattern)?.[1];
check(`API is ${expected.api}`, baked(/var api = trustedService\("([^"]*)"\)/) === expected.api, baked(/var api = trustedService\("([^"]*)"\)/));
check(`website is ${expected.website}`, baked(/var website = trustedService\("([^"]*)"\)/) === expected.website, baked(/var website = trustedService\("([^"]*)"\)/));
check(`update feed is ${expected.feed}`, baked(/var updateFeed = "([^"]*)"/) === expected.feed, baked(/var updateFeed = "([^"]*)"/));
check('built as a signed release (updates install themselves)', /var autoUpdate = import_electron\.app\.isPackaged && true &&/.test(main));
check('renderer may only reach the production API', asar.extractFile(archive, 'dist/index.html').toString().includes(`connect-src &#39;self&#39; ${expected.api}`));
const files = asar.listPackage(archive);
check('no .env file is packaged', !files.some(file => /(^|\/)\.env/.test(file)), files.filter(file => /\.env/.test(file)).join(', '));
check('tray icon is packaged', files.includes('/build/tray.png'));
const updater = readFileSync(join(app, 'Contents/Resources/app-update.yml'), 'utf8');
check('electron-builder feed matches', updater.includes(`url: ${expected.feed.replace(/\/$/, '')}`), updater.match(/url: .*/)?.[0]);

// latest-mac.yml must describe exactly the files that will be uploaded.
const local = feedFiles(readFileSync(join(release, 'latest-mac.yml'), 'utf8'));
check(`latest-mac.yml is for ${version}`, local.version === version, local.version);
for (const file of local.files) {
  const path = join(release, file.url);
  check(`${file.url} exists, with the size and sha512 in latest-mac.yml`, existsSync(path) && readFileSync(path).length === file.size && sha512(path) === file.sha512);
}

// Hardening (ELEC-11): no other program may run code inside Ctrue and borrow its macOS permissions.
check('signed with the hardened runtime', /flags=0x[0-9a-f]*\(.*runtime/.test(run('codesign', ['-dv', app]).out));
const fuses = await getCurrentFuseWire(join(app, 'Contents/MacOS/Ctrue'));
for (const fuse of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments']) check(`${fuse} fuse is off`, fuses[FuseV1Options[fuse]] === '0'.charCodeAt(0));

if (process.argv.includes('--published')) {
  // What installed copies and the website download right now.
  const response = await fetch(`${expected.feed}latest-mac.yml`);
  const published = feedFiles(await response.text());
  check(`published feed is ${version}`, response.ok && published.version === version, published.version);
  check('published feed matches this build', JSON.stringify(published.files) === JSON.stringify(local.files));
  const size = async url => { const head = await fetch(url, { method: 'HEAD' }); return head.ok ? Number(head.headers.get('content-length')) : -head.status; };
  // The updater downloads only the zip; the DMG is uploaded under the website's link name, checked next.
  for (const file of published.files.filter(file => !file.url.endsWith('.dmg'))) check(`published ${file.url} has the listed size`, await size(`${expected.feed}${file.url}`) === file.size);
  const dmg = local.files.find(file => file.url.endsWith('.dmg'));
  check('website download (Ctrue-mac-arm64.dmg) is this build\'s DMG', !!dmg && await size(`${expected.feed}Ctrue-mac-arm64.dmg`) === dmg.size);
}

console.log(failures.length ? `\n${failures.length} release check(s) failed.` : '\nRelease checks passed.');
process.exit(failures.length ? 1 : 0);
