// Read-only checks against the live website and API: only GET, HEAD and CORS preflight requests, nothing is written.
const API = process.env.CTRUE_API_URL || 'https://api.ctrue.monishpatalay.dev';
const WEB = process.env.CTRUE_WEBSITE_URL || 'https://ctrue.monishpatalay.dev';
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? '✔' : '✖'} ${name}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failures.push(name); };
const get = (url, init = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), ...init });

const health = await (await get(`${API}/health`)).json();
check('API is up in live mode with sign-in and AI configured', health.status === 'ok' && health.mode === 'live' && health.configured?.auth && health.configured?.ai, JSON.stringify(health));
const evil = await get(`${API}/health`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
check('API refuses other websites', evil.status === 403 && !evil.headers.get('access-control-allow-origin'), `${evil.status}`);
const own = await get(`${API}/health`, { method: 'OPTIONS', headers: { Origin: WEB, 'Access-Control-Request-Method': 'GET' } });
check('API allows the website', own.headers.get('access-control-allow-origin') === WEB, own.headers.get('access-control-allow-origin'));
check('API refuses a junk token', (await get(`${API}/account`, { headers: { Authorization: `Bearer ${'0'.repeat(64)}` } })).status === 401);
check('API does not advertise Express', !(await get(`${API}/health`)).headers.get('x-powered-by'));

const home = await get(WEB);
check('website home page loads', home.ok);
const dashboard = await get(`${WEB}/dashboard`);
check('signed-out /dashboard redirects to /login', [302, 303, 307, 308].includes(dashboard.status) && /\/login/.test(dashboard.headers.get('location') || ''), `${dashboard.status} ${dashboard.headers.get('location')}`);
const downloads = await (await get(`${WEB}/downloads`)).text();
const dmg = downloads.match(/href="(https:\/\/[^"]+\.dmg)"/)?.[1];
check('downloads page links an https DMG', !!dmg, 'no DMG link (Build locally shown)');
if (dmg) check('the DMG link resolves', (await fetch(dmg, { method: 'HEAD', signal: AbortSignal.timeout(15000) })).ok);
const privacy = await (await get(`${WEB}/privacy`)).text();
check('privacy policy names a contact for data requests', !privacy.includes('Contact details will be published here before launch.'), 'placeholder shown (LEG-1)');
for (const header of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) check(`website sends ${header}`, !!home.headers.get(header));

console.log(failures.length ? `\n${failures.length} production check(s) failed.` : '\nProduction checks passed.');
process.exit(failures.length ? 1 : 0);
