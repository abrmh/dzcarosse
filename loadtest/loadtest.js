#!/usr/bin/env node
// Test de charge SANS dépendance (Node 18+ seulement). Simule N visiteurs simultanés qui
// naviguent (page d'accueil, liste des annonces, signal de présence).
//
//   node loadtest/loadtest.js https://ton-site.com
//   node loadtest/loadtest.js https://ton-site.com --users 4000 --ramp 60 --duration 120
//
// Options :  --users N     visiteurs simultanés (défaut 1000)
//            --ramp S      secondes pour les faire arriver progressivement (défaut 30)
//            --duration S  durée totale du test en secondes (défaut 90)
//            --think S     pause moyenne d'un visiteur entre deux actions (défaut 8)
//            --sockets N   connexions TCP max depuis CETTE machine (défaut 500)
//
// ⚠ À lancer uniquement sur TON site. Lance-le depuis un autre ordinateur/serveur que celui
// qui héberge le site, et idéalement HORS heures de pointe. Avec Cloudflare actif, il peut
// déclencher ses protections (mode « Under Attack », bots) : fais le test en mettant
// temporairement le DNS en « DNS only » (nuage gris), ou ajoute ton IP en liste blanche.
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const args = process.argv.slice(2);
const target = args.find(a => /^https?:\/\//.test(a));
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? Number(args[i + 1]) : def; };
if (!target) { console.error('Usage : node loadtest/loadtest.js https://ton-site.com [--users 4000] [--ramp 60] [--duration 120]'); process.exit(1); }

const USERS = opt('users', 1000), RAMP = opt('ramp', 30), DURATION = opt('duration', 90),
      THINK = opt('think', 8), SOCKETS = opt('sockets', 500);
const url = new URL(target);
const lib = url.protocol === 'https:' ? https : http;
const agent = new lib.Agent({ keepAlive: true, maxSockets: SOCKETS });

const stats = {};   // endpoint -> { n, err, codes, lat:[] }
const rec = (name, ms, code, err) => {
  const s = stats[name] || (stats[name] = { n: 0, err: 0, codes: {}, lat: [] });
  s.n++; if (err) s.err++; else s.codes[code] = (s.codes[code] || 0) + 1;
  if (s.lat.length < 200000) s.lat.push(ms);
};

function hit(name, method, path, headers) {
  return new Promise(resolve => {
    const t0 = process.hrtime.bigint();
    const done = (code, err) => { rec(name, Number(process.hrtime.bigint() - t0) / 1e6, code, err); resolve(); };
    const req = lib.request({ agent, method, hostname: url.hostname, port: url.port || undefined, path,
      headers: { 'User-Agent': 'dzair-carrosse-loadtest', 'Accept-Encoding': 'gzip', ...headers }, timeout: 20000 }, res => {
      res.resume();
      res.on('end', () => done(res.statusCode, res.statusCode >= 500 || res.statusCode === 429));
    });
    req.on('timeout', () => { req.destroy(); done(0, true); });
    req.on('error', () => done(0, true));
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const stopAt = Date.now() + DURATION * 1000;

async function visitor(i) {
  await sleep((i / USERS) * RAMP * 1000);                       // arrivée progressive
  const token = crypto.randomBytes(16).toString('hex');
  await hit('GET /', 'GET', '/');
  await hit('POST /api/presence', 'POST', '/api/presence', { 'X-Visitor': token });
  while (Date.now() < stopAt) {
    await sleep(THINK * 1000 * (0.5 + Math.random()));          // temps de lecture
    const r = Math.random();
    if (r < 0.65) await hit('GET /api/cars', 'GET', '/api/cars');
    else if (r < 0.80) await hit('GET /api/cars?q=…', 'GET', '/api/cars?q=' + ['golf', 'clio', 'toyota', 'peugeot', 'hyundai'][i % 5]);
    else if (r < 0.90) await hit('GET /', 'GET', '/');
    else await hit('POST /api/presence', 'POST', '/api/presence', { 'X-Visitor': token });
  }
}

const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
function report() {
  console.log('\n===== RÉSULTAT =====');
  let total = 0, errs = 0;
  for (const [name, s] of Object.entries(stats)) {
    s.lat.sort((a, b) => a - b); total += s.n; errs += s.err;
    console.log(`${name.padEnd(22)} ${String(s.n).padStart(7)} req | erreurs ${String(s.err).padStart(6)} (${(100 * s.err / s.n).toFixed(1)}%) | p50 ${pct(s.lat, .5).toFixed(0)} ms | p95 ${pct(s.lat, .95).toFixed(0)} ms | p99 ${pct(s.lat, .99).toFixed(0)} ms | codes ${JSON.stringify(s.codes)}`);
  }
  const rate = errs / Math.max(1, total);
  console.log(`\nTotal : ${total} requêtes, ${errs} erreurs (${(100 * rate).toFixed(2)}%), ~${(total / DURATION).toFixed(0)} req/s`);
  console.log(rate < 0.01 ? '✅ OK : moins de 1 % d\'erreurs.' : '❌ Trop d\'erreurs (429 = limite par IP, 5xx/0 = serveur saturé ou timeouts).');
  console.log('Repère : un bon résultat = p95 sous ~800 ms et moins de 1 % d\'erreurs.');
  process.exit(0);
}

console.log(`Test : ${USERS} visiteurs sur ${target} — arrivée en ${RAMP}s, durée ${DURATION}s`);
const tick = setInterval(() => {
  const n = Object.values(stats).reduce((a, s) => a + s.n, 0), e = Object.values(stats).reduce((a, s) => a + s.err, 0);
  process.stdout.write(`\r${Math.round((DURATION * 1000 - (stopAt - Date.now())) / 1000)}s  requêtes ${n}  erreurs ${e}   `);
}, 1000);
Promise.all(Array.from({ length: USERS }, (_, i) => visitor(i))).then(() => { clearInterval(tick); report(); });
