// Journal de sécurité pour l'admin : adresses IP des visiteurs + tentatives
// suspectes (scan de fichiers sensibles, force brute sur le login, abus de
// requêtes, accès admin refusés).
//
// Données personnelles : une adresse IP en est une. Elles sont donc conservées
// peu de temps (SECURITY_RETENTION_DAYS, défaut 30 jours), plafonnées, visibles
// uniquement de l'admin, et mentionnées dans la politique de confidentialité.
// db.security = { visitors: { ip: { first, last, hits, ua, bad: {type: n} } }, events: [...] }
const store = require('./store');

const MAX_VISITORS = 5000;
const MAX_EVENTS = 500;
const FLAG_SCORE = 5; // score à partir duquel une IP est signalée "suspecte"
const WEIGHTS = { probe: 3, rate_limited: 2, admin_denied: 3, login_failed: 1 };

// Fichiers statiques : ne comptent pas comme une "visite".
const ASSET_RE = /\.(css|js|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|webmanifest)(\?|$)/i;
// Chemins typiques des robots qui cherchent des failles / fichiers sensibles.
const PROBE_RE = /(\.env|\.git(\/|$|\?)|\.svn|\.ds_store|wp-(admin|login|content|includes)|xmlrpc|phpmyadmin|phpinfo|\.php(\?|$|\/)|\.aspx?(\?|$)|\.jsp(\?|$)|cgi-bin|etc\/passwd|\.\.\/|%2e%2e|\/actuator|\/\.aws|\/vendor\/|\.sql(\?|$)|\.bak(\?|$)|\/config\.json)/i;

function retentionMs() {
  const n = Number(process.env.SECURITY_RETENTION_DAYS);
  return (n > 0 ? n : 30) * 864e5;
}

function ensure(db) {
  if (!db.security || typeof db.security !== 'object') db.security = {};
  if (!db.security.visitors) db.security.visitors = {};
  if (!Array.isArray(db.security.events)) db.security.events = [];
  return db.security;
}

const scoreOf = v => Object.entries(v.bad || {}).reduce((s, [k, n]) => s + (WEIGHTS[k] || 1) * n, 0);
const cleanIp = ip => String(ip || 'inconnue').replace(/^::ffff:/, '').slice(0, 64);

let timer = null;
function schedulePersist() {
  store.touchMeta('security');
  if (timer) return;
  timer = setTimeout(() => { timer = null; store.persist(); }, 30 * 1000);
  timer.unref();
}

function prune(s) {
  const limit = Date.now() - retentionMs();
  for (const ip of Object.keys(s.visitors)) if (s.visitors[ip].last < limit) delete s.visitors[ip];
  s.events = s.events.filter(e => e.t >= limit).slice(-MAX_EVENTS);
  const keys = Object.keys(s.visitors);
  if (keys.length > MAX_VISITORS) {
    // On garde en priorité les IP suspectes, puis les plus récentes.
    keys.sort((a, b) => (scoreOf(s.visitors[a]) >= FLAG_SCORE) - (scoreOf(s.visitors[b]) >= FLAG_SCORE) || s.visitors[a].last - s.visitors[b].last)
      .slice(0, keys.length - MAX_VISITORS).forEach(k => delete s.visitors[k]);
  }
}

function track(req, res, url, isAsset) {
  // Pas de journal pour l'admin connecté (requête normale, connexion ou déconnexion).
  if (res.locals.isAdmin || (req.session && req.session.role === 'admin')) return;
  const db = store.load();
  const s = ensure(db);
  const ip = cleanIp(req.ip);
  const now = Date.now();
  let v = s.visitors[ip];

  let type = null;
  const code = res.statusCode;
  if (PROBE_RE.test(url)) type = 'probe';
  else if (code === 429) type = 'rate_limited';
  else if ((code === 401 || code === 403) && url.startsWith('/api/admin')) type = 'admin_denied';
  else if (code === 401 && req.method === 'POST' && url.startsWith('/api/auth/login')) type = 'login_failed';

  if (isAsset && !type) return;
  if (!v) {
    v = s.visitors[ip] = { first: now, last: now, hits: 0, ua: String(req.headers['user-agent'] || '').slice(0, 120), bad: {} };
    if (Object.keys(s.visitors).length > MAX_VISITORS + 500) prune(s);
  }
  v.last = now;
  if (!isAsset) v.hits += 1;
  if (type) {
    v.bad[type] = (v.bad[type] || 0) + 1;
    s.events.push({ t: now, ip, type, path: url.slice(0, 120) });
    if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
  }
  schedulePersist();
}

function middleware(req, res, next) {
  const url = req.originalUrl || req.url || '';
  const isAsset = ASSET_RE.test(url.split('?')[0]) || url.startsWith('/uploads/');
  res.on('finish', () => { try { track(req, res, url, isAsset); } catch (e) { /* ne jamais casser une requête pour du log */ } });
  next();
}

function purge() {
  const s = ensure(store.load());
  prune(s);
  store.touchMeta('security');
}

// Vide tout ou partie du journal (action de l'admin).
//  incidents  -> vide la liste des incidents
//  suspicious -> remet à zéro les scores (les IP restent dans la liste des visiteurs)
//  visitors   -> supprime toutes les IP enregistrées (et donc les scores)
//  all        -> tout
const CLEAR_SCOPES = ['incidents', 'suspicious', 'visitors', 'all'];
function clear(scope) {
  if (!CLEAR_SCOPES.includes(scope)) return false;
  const s = ensure(store.load());
  if (scope === 'incidents' || scope === 'all') s.events = [];
  if (scope === 'suspicious' || scope === 'all') Object.values(s.visitors).forEach(v => { v.bad = {}; });
  if (scope === 'visitors' || scope === 'all') s.visitors = {};
  store.touchMeta('security');
  store.persist();
  return true;
}

function buildReport(adminIp) {
  const s = ensure(store.load());
  const now = Date.now();
  const mine = cleanIp(adminIp);
  const list = Object.entries(s.visitors).map(([ip, v]) => ({
    ip, first: v.first, last: v.last, hits: v.hits, ua: v.ua || '', bad: v.bad || {},
    score: scoreOf(v), you: ip === mine
  }));
  const flagged = list.filter(x => x.score >= FLAG_SCORE);
  return {
    totals: {
      uniqueIps: list.length,
      active24h: list.filter(x => x.last > now - 864e5).length,
      suspicious: flagged.length,
      events24h: s.events.filter(e => e.t > now - 864e5).length,
      retentionDays: Math.round(retentionMs() / 864e5)
    },
    suspicious: flagged.sort((a, b) => b.score - a.score || b.last - a.last).slice(0, 100),
    visitors: list.sort((a, b) => b.last - a.last).slice(0, 300),
    events: s.events.slice(-100).reverse(),
    yourIp: mine
  };
}

module.exports = { middleware, buildReport, purge, clear, ensure };
