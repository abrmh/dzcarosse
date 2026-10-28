// Statistiques de recherche (agrégées : aucun compteur par visiteur, aucune IP).
// Structure dans db.analytics :
//   daily: { 'YYYY-MM-DD': { total, none, other, brands: { Dacia: 3, ... } } }
//   terms: { 'logan': { n, zero } }   (termes tapés, normalisés, plafonnés)
// Une "recherche" = une requête de la liste publique avec un texte (q).
const store = require('./store');

const KNOWN_BRANDS = [
  'Dacia', 'Renault', 'Peugeot', 'Citroën', 'Toyota', 'Hyundai', 'Kia', 'Volkswagen', 'Fiat',
  'Seat', 'Skoda', 'Suzuki', 'Nissan', 'Chevrolet', 'Ford', 'Mercedes', 'BMW', 'Audi', 'Opel',
  'Mazda', 'Honda', 'Mitsubishi', 'Chery', 'Geely', 'Haval', 'Isuzu', 'Jeep', 'Land Rover',
  'Mini', 'Volvo', 'Lada', 'Iveco', 'Tesla', 'Jetour', 'MG', 'BYD'
];
const MAX_TERMS = 300;
const KEEP_DAYS = 400;

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);

function ensure(db) {
  if (!db.analytics || typeof db.analytics !== 'object') db.analytics = {};
  if (!db.analytics.daily) db.analytics.daily = {};
  if (!db.analytics.terms) db.analytics.terms = {};
  // Total des visites depuis le début (ne redescend jamais). Si le compteur n'existait pas
  // encore, on le reconstitue à partir des visites déjà comptées jour par jour.
  if (typeof db.analytics.totalVisits !== 'number') {
    db.analytics.totalVisits = Object.values(db.analytics.daily).reduce((s, d) => s + (d.visitors || 0), 0);
  }
  return db.analytics;
}

// Quelles marques correspondent à ce que le client a tapé ?
function matchBrands(db, needle) {
  const names = new Map(); // norm -> nom d'affichage (le stock a priorité sur la liste)
  KNOWN_BRANDS.forEach(b => names.set(norm(b), b));
  db.cars.forEach(c => { if (c.brand) names.set(norm(c.brand), c.brand); });

  const found = new Set();
  for (const [key, label] of names) {
    if (needle.includes(key) || (needle.length >= 3 && key.startsWith(needle))) found.add(label);
  }
  if (!found.size && needle.length >= 3) {      // ex. "logan" -> Dacia
    db.cars.forEach(c => { if (norm(c.model).includes(needle)) found.add(c.brand); });
  }
  return found.size <= 3 ? [...found] : [];     // trop vague (ex. "a") : non attribué
}

let timer = null;
function schedulePersist() {
  store.touchMeta('analytics');
  if (timer) return;
  timer = setTimeout(() => { timer = null; store.persist(); }, 30 * 1000);
  timer.unref();
}

function recordSearch(q, resultCount) {
  const needle = norm(q);
  if (needle.length < 2 || needle.length > 60) return;
  const db = store.load();
  const a = ensure(db);
  const day = a.daily[dayKey()] || (a.daily[dayKey()] = { total: 0, none: 0, other: 0, brands: {} });

  day.total += 1;
  if (!resultCount) day.none += 1;
  const brands = matchBrands(db, needle);
  if (brands.length) brands.forEach(b => { day.brands[b] = (day.brands[b] || 0) + 1; });
  else day.other += 1;

  const t = a.terms[needle] || (a.terms[needle] = { n: 0, zero: 0 });
  t.n += 1;
  if (!resultCount) t.zero += 1;

  // Plafonnement : on retire les termes les plus rares.
  const keys = Object.keys(a.terms);
  if (keys.length > MAX_TERMS) {
    keys.sort((x, y) => a.terms[x].n - a.terms[y].n).slice(0, keys.length - MAX_TERMS + 20).forEach(k => delete a.terms[k]);
  }
  // Purge des très vieux jours.
  const limit = dayKey(Date.now() - KEEP_DAYS * 864e5);
  Object.keys(a.daily).forEach(d => { if (d < limit) delete a.daily[d]; });

  schedulePersist();
}

// Compteurs de fréquentation (agrégés par jour, sans aucune donnée personnelle).
function dayOf(a) {
  const k = dayKey();
  return a.daily[k] || (a.daily[k] = { total: 0, none: 0, other: 0, brands: {} });
}
function recordVisit() {
  const a = ensure(store.load());
  const day = dayOf(a);
  day.visitors = (day.visitors || 0) + 1;     // visites du jour
  a.totalVisits += 1;                          // visites depuis le début
  schedulePersist();
}
function recordLogin() {
  const a = ensure(store.load());
  const day = dayOf(a);
  day.logins = (day.logins || 0) + 1;
  schedulePersist();
}
function todayTraffic() {
  const a = ensure(store.load());
  const day = a.daily[dayKey()] || {};
  return { visitorsToday: day.visitors || 0, loginsToday: day.logins || 0, totalVisits: a.totalVisits };
}

// Construit le tableau de bord pour l'admin sur les `days` derniers jours.
function buildReport(days) {
  const db = store.load();
  const a = ensure(db);
  const now = Date.now();
  const dayList = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(dayKey(now - i * 864e5));

  const searchesPerDay = dayList.map(d => (a.daily[d] ? a.daily[d].total : 0));
  const visitorsPerDay = dayList.map(d => (a.daily[d] ? a.daily[d].visitors || 0 : 0));
  const loginsPerDay = dayList.map(d => (a.daily[d] ? a.daily[d].logins || 0 : 0));
  const signupsPerDay = dayList.map(d => db.users.filter(u => u.role !== 'admin' && dayKey(u.createdAt) === d).length);

  const brandCount = {};
  let total = 0, none = 0, other = 0;
  dayList.forEach(d => {
    const x = a.daily[d]; if (!x) return;
    total += x.total; none += x.none; other += x.other;
    Object.entries(x.brands).forEach(([b, n]) => { brandCount[b] = (brandCount[b] || 0) + n; });
  });
  const attributed = Object.values(brandCount).reduce((s, n) => s + n, 0);
  const searchBrands = Object.entries(brandCount).sort((x, y) => y[1] - x[1]).slice(0, 12)
    .map(([brand, n]) => ({ brand, count: n, pct: attributed ? Math.round(n * 1000 / attributed) / 10 : 0 }));

  const share = (list, getKey) => {
    const m = {}; list.forEach(o => { const k = getKey(o) || '—'; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 10)
      .map(([k, n]) => ({ label: k, count: n, pct: list.length ? Math.round(n * 1000 / list.length) / 10 : 0 }));
  };

  const cutoff = dayList[0];
  const terms = Object.entries(a.terms).map(([term, v]) => ({ term, n: v.n, zero: v.zero }));
  return {
    days,
    labels: dayList,
    searches: { total, noResult: none, unmatched: other, perDay: searchesPerDay, brands: searchBrands, attributed },
    topTerms: terms.sort((x, y) => y.n - x.n).slice(0, 10),
    missedTerms: terms.filter(t => t.zero > 0).sort((x, y) => y.zero - x.zero).slice(0, 10),
    signupsPerDay,
    visitorsPerDay,
    loginsPerDay,
    stockByBrand: share(db.cars, c => c.brand),
    requestsByBrand: share(db.requests, r => r.brand),
    stockByFuel: share(db.cars, c => c.fuel),
    totalVisits: a.totalVisits,
    since: cutoff
  };
}

module.exports = { recordSearch, recordVisit, recordLogin, todayTraffic, buildReport, ensure };
