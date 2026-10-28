// Présence en ligne + compteur de visites.
//  • « En ligne maintenant » : chaque onglet ouvert envoie un signal chaque minute avec un
//    identifiant anonyme aléatoire (jamais l'adresse IP, aucun cookie) ; on compte ceux
//    qui ont donné signe de vie dans les 5 dernières minutes (en mémoire uniquement).
//  • « Visites » : une visite = un navigateur qui arrive pour la première fois, ou qui revient
//    après VISIT_GAP_MINUTES d'inactivité (variable du .env, 60 par défaut). Un simple
//    rafraîchissement de page n'est jamais une nouvelle visite. Le navigateur indique depuis
//    combien de secondes il était inactif (en-tête X-Idle) ; le serveur décide. Chaque visite
//    incrémente un compteur total qui ne redescend jamais (conservé en base).
// En mode cluster (plusieurs workers) chaque worker compte « en ligne » séparément.
const analytics = require('./analytics');

const WINDOW_MS = 5 * 60 * 1000;
const GAP_MIN = Number(process.env.VISIT_GAP_MINUTES);
const VISIT_GAP_MS = (Number.isFinite(GAP_MIN) && GAP_MIN >= 1 && GAP_MIN <= 1440 ? GAP_MIN : 60) * 60 * 1000;
const MAX_TRACKED = 20000;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_VISITS_PER_IP_PER_HOUR = 120;   // garde-fou : un script ne peut pas gonfler le compteur

const seen = new Map();          // identifiant anonyme -> { t: dernier signal, member: bool }
const lastVisit = new Map();     // identifiant anonyme -> date de la dernière activité (pour détecter l'inactivité)
const ipWindow = new Map();      // ip -> { start, n } (en mémoire, jamais enregistré)
let todayKey = '';
let peakToday = 0;

const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

function prune(now = Date.now()) {
  for (const [k, v] of seen) if (now - v.t > WINDOW_MS) seen.delete(k);
  for (const [k, t] of lastVisit) if (now - t > VISIT_GAP_MS) lastVisit.delete(k);
  for (const [k, w] of ipWindow) if (now - w.start > 3600 * 1000) ipWindow.delete(k);
}
setInterval(prune, 30 * 1000).unref();

function rollDay(now) {
  const k = dayKey(now);
  if (k !== todayKey) { todayKey = k; peakToday = 0; }
}

function ipAllows(ip, now) {
  const w = ipWindow.get(ip);
  if (!w || now - w.start > 3600 * 1000) { ipWindow.set(ip, { start: now, n: 1 }); return true; }
  if (w.n >= MAX_VISITS_PER_IP_PER_HOUR) return false;
  w.n += 1;
  return true;
}

// idleSec : secondes d'inactivité vues par le navigateur avant ce signal (null = première
// fois que ce navigateur vient).
function ping(token, isMember, idleSec, ip) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
  const now = Date.now();
  rollDay(now);
  if (seen.size >= MAX_TRACKED && !seen.has(token)) { prune(now); if (seen.size >= MAX_TRACKED) return false; }
  seen.set(token, { t: now, member: !!isMember });
  const last = lastVisit.get(token);
  let isNewVisit;
  if (last) isNewVisit = now - last > VISIT_GAP_MS;                          // connu du serveur
  else isNewVisit = idleSec === null || idleSec * 1000 > VISIT_GAP_MS;       // inconnu (ex. redémarrage) : on croit le navigateur
  if (lastVisit.size < 200000) lastVisit.set(token, now);
  if (isNewVisit && ipAllows(String(ip || ''), now)) analytics.recordVisit();
  if (seen.size > peakToday) peakToday = seen.size;
  return true;
}

function snapshot() {
  const now = Date.now();
  rollDay(now);
  prune(now);
  let members = 0;
  seen.forEach(v => { if (v.member) members += 1; });
  return { online: seen.size, members, guests: seen.size - members, peakToday: Math.max(peakToday, seen.size) };
}

module.exports = { ping, snapshot };
