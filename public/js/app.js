/* =========================================================
   DZair Carrosse — frontend (parle au backend Node.js via fetch)
   Traductions : voir i18n.js (chargé avant ce fichier), fonction t().
   ========================================================= */
let session = null;          // utilisateur connecté, ou null
let view = 'home';
let carsCache = [];
let requestsCache = [];
let myRequestsCache = [];
let accountsCache = [];
let statsCache = { dealers: 0, users: 0, cars: 0, requests: 0 };
let storageCache = { filesOnDisk: 0, bytesOnDisk: 0, orphanFiles: 0, photos: [] };
let messagesCache = { messages: [], unreadCount: 0 };
let analyticsDays = 30;
let analyticsCache = null;
let securityCache = null;
let contactSent = false;     // affiche l'accusé de réception après envoi du formulaire
let editingAccount = null;   // compte (dealer ou particulier) en cours de modification par l'admin
let modalData = null;        // { type: 'car'|'request', data: {...} }
let formMsg = { login: '', register: '', dealerCar: '', request: '', admin: '', account: '', profile: '', contact: '' };
let filters = { q: '', fuel: '', maxPrice: '', wilaya: '' };
let wilayasCache = [];       // wilayas où il existe au moins un concessionnaire
let authTab = 'login';
let editingCar = null;
let editingReq = null;
let busy = false;            // désactive les boutons pendant un appel réseau

const FUELS = ['Essence', 'Diesel', 'Électrique', 'Hybride'];
const GEARBOX = ['Manuelle', 'Automatique'];

// Wilayas : [code, nom français, nom arabe]. Même liste que lib/wilayas.js (serveur).
const WILAYAS = [
  ['01', 'Adrar', 'أدرار'],
  ['02', 'Chlef', 'الشلف'],
  ['03', 'Laghouat', 'الأغواط'],
  ['04', 'Oum El Bouaghi', 'أم البواقي'],
  ['05', 'Batna', 'باتنة'],
  ['06', 'Béjaïa', 'بجاية'],
  ['07', 'Biskra', 'بسكرة'],
  ['08', 'Béchar', 'بشار'],
  ['09', 'Blida', 'البليدة'],
  ['10', 'Bouira', 'البويرة'],
  ['11', 'Tamanrasset', 'تمنراست'],
  ['12', 'Tébessa', 'تبسة'],
  ['13', 'Tlemcen', 'تلمسان'],
  ['14', 'Tiaret', 'تيارت'],
  ['15', 'Tizi Ouzou', 'تيزي وزو'],
  ['16', 'Alger', 'الجزائر'],
  ['17', 'Djelfa', 'الجلفة'],
  ['18', 'Jijel', 'جيجل'],
  ['19', 'Sétif', 'سطيف'],
  ['20', 'Saïda', 'سعيدة'],
  ['21', 'Skikda', 'سكيكدة'],
  ['22', 'Sidi Bel Abbès', 'سيدي بلعباس'],
  ['23', 'Annaba', 'عنابة'],
  ['24', 'Guelma', 'قالمة'],
  ['25', 'Constantine', 'قسنطينة'],
  ['26', 'Médéa', 'المدية'],
  ['27', 'Mostaganem', 'مستغانم'],
  ['28', "M'Sila", 'المسيلة'],
  ['29', 'Mascara', 'معسكر'],
  ['30', 'Ouargla', 'ورقلة'],
  ['31', 'Oran', 'وهران'],
  ['32', 'El Bayadh', 'البيض'],
  ['33', 'Illizi', 'إليزي'],
  ['34', 'Bordj Bou Arréridj', 'برج بوعريريج'],
  ['35', 'Boumerdès', 'بومرداس'],
  ['36', 'El Tarf', 'الطارف'],
  ['37', 'Tindouf', 'تندوف'],
  ['38', 'Tissemsilt', 'تيسمسيلت'],
  ['39', 'El Oued', 'الوادي'],
  ['40', 'Khenchela', 'خنشلة'],
  ['41', 'Souk Ahras', 'سوق أهراس'],
  ['42', 'Tipaza', 'تيبازة'],
  ['43', 'Mila', 'ميلة'],
  ['44', 'Aïn Defla', 'عين الدفلى'],
  ['45', 'Naâma', 'النعامة'],
  ['46', 'Aïn Témouchent', 'عين تموشنت'],
  ['47', 'Ghardaïa', 'غرداية'],
  ['48', 'Relizane', 'غليزان'],
  ['49', 'Timimoun', 'تيميمون'],
  ['50', 'Bordj Badji Mokhtar', 'برج باجي مختار'],
  ['51', 'Ouled Djellal', 'أولاد جلال'],
  ['52', 'Béni Abbès', 'بني عباس'],
  ['53', 'In Salah', 'عين صالح'],
  ['54', 'In Guezzam', 'عين قزام'],
  ['55', 'Touggourt', 'تقرت'],
  ['56', 'Djanet', 'جانت'],
  ['57', 'El M’Ghair', 'المغير'],
  ['58', 'El Meniaa', 'المنيعة']
];
const wilayaLabel = w => `${w[0]} - ${getLang() === 'ar' ? w[2] : w[1]}`;
function wilayaName(code) {
  const w = WILAYAS.find(x => x[0] === String(code));
  return w ? (getLang() === 'ar' ? w[2] : w[1]) : '';
}
// Liste déroulante des 58 wilayas (champ obligatoire à la création d'un concessionnaire).
function wilayaSelect(selected) {
  return `<select name="wilaya" required>
    <option value="">${esc(t('field.wilayaChoose'))}</option>
    ${WILAYAS.map(w => `<option value="${w[0]}" ${String(selected) === w[0] ? 'selected' : ''}>${esc(wilayaLabel(w))}</option>`).join('')}
  </select>`;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function numberLocale() {
  const lang = getLang();
  // '-u-nu-latn' force les chiffres occidentaux (0-9) même en arabe, pour
  // rester cohérent avec les champs numériques du formulaire.
  return lang === 'ar' ? 'ar-DZ-u-nu-latn' : lang === 'en' ? 'en-US' : 'fr-FR';
}
function fmtPrice(n) {
  const lang = getLang();
  const num = Number(n).toLocaleString(numberLocale());
  // Dinar algérien : "DA" en français/anglais (usage courant en Algérie),
  // "دج" en arabe.
  return lang === 'ar' ? num + ' دج' : num + ' DA';
}
function fmtKm(n) { return Number(n).toLocaleString(numberLocale()) + ' km'; }
function fallbackImg(el, text) { el.src = 'https://placehold.co/640x420/10233F/ffffff?text=' + encodeURIComponent(text); }

// Gestion centralisée des images cassées : on utilise un attribut de données
// (data-fallback) plutôt qu'un onerror="..." inline. Un attribut inline
// aurait exécuté du JavaScript construit à partir de texte (marque, modèle...)
// saisi par des utilisateurs (concessionnaires/particuliers) : même échappé
// pour du HTML, un tel texte peut casser hors de la chaîne JS injectée et
// exécuter du code arbitraire (XSS). Cette délégation lit la valeur déjà
// décodée par le navigateur depuis dataset — jamais interprétée comme code.
// "error" ne remonte pas (bubble) sur les <img>, d'où l'écoute en phase de
// capture (true) sur le document entier.
document.addEventListener('error', (e) => {
  const el = e.target;
  if (el && el.tagName === 'IMG' && el.dataset && el.dataset.fallback !== undefined && !el.dataset.fallbackApplied) {
    el.dataset.fallbackApplied = '1'; // évite une boucle si le placeholder échoue aussi
    fallbackImg(el, el.dataset.fallback);
  }
}, true);

/* ---------------- appel API ---------------- */
async function api(path, { method = 'GET', json, form } = {}) {
  const opts = { method, credentials: 'include', headers: { 'X-Lang': getLang() } };
  if (form) {
    opts.body = form;
  } else if (json) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(json);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch (e) { /* pas de corps JSON */ }
  if (res.status === 401 && session && !path.startsWith('/api/auth/login')) {
    // Le serveur ne reconnaît plus la session (redémarrage, expiration...) : on revient
    // proprement à la connexion au lieu de laisser un écran « connecté » qui échoue.
    session = null; trafficCache = null;
    setTimeout(async () => { await goto('auth'); formMsg.login = t('auth.sessionExpired'); render(); }, 0);
  }
  if (!res.ok) throw new Error(data.error || `Erreur (${res.status})`);
  // Connexion / déconnexion : on met à jour tout de suite le compteur « en ligne ».
  if (/^\/api\/auth\/(login|register|logout)/.test(path)) { setTimeout(pingPresence, 0); setTimeout(pollTraffic, 400); }
  return data;
}

// ---- Présence en ligne (anonyme) + compteur admin ----
let trafficCache = null;   // { online, members, guests, peakToday, visitorsToday, loginsToday }
// Le navigateur garde un identifiant anonyme + l'heure de sa dernière activité, et envoie au
// serveur « inactif depuis X secondes ». Le serveur décide s'il s'agit d'une nouvelle visite
// (délai réglé par VISIT_GAP_MINUTES dans .env). Un rafraîchissement ne change rien.
const VISIT_KEY = 'dzair-carrosse_vid';
let memVisit = null;   // repli si le navigateur interdit tout stockage
function visitInfo() {
  const now = Date.now();
  const rand = () => {
    const bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  };
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const st = store();
      let id = st.getItem(VISIT_KEY);
      if (!id || !/^[0-9a-f]{32}$/.test(id)) { id = rand(); st.setItem(VISIT_KEY, id); st.removeItem(VISIT_KEY + '_t'); }
      const last = Number(st.getItem(VISIT_KEY + '_t') || 0);
      st.setItem(VISIT_KEY + '_t', String(now));
      return { id, idle: last ? Math.max(0, Math.round((now - last) / 1000)) : null };
    } catch (e) { /* stockage indisponible : on essaie le suivant */ }
  }
  if (!memVisit) memVisit = { id: rand(), t: 0 };
  const idle = memVisit.t ? Math.round((now - memVisit.t) / 1000) : null;
  memVisit.t = now;
  return { id: memVisit.id, idle };
}
function pingPresence() {
  if (document.hidden) return;
  const v = visitInfo();
  if (!v.id) return;
  const headers = { 'X-Visitor': v.id };
  if (v.idle !== null) headers['X-Idle'] = String(v.idle);
  fetch('/api/presence', { method: 'POST', credentials: 'include', keepalive: true, headers }).catch(() => {});
}
function trafficHtml() {
  const x = trafficCache;
  return x ? { n: x.online, sub: t('traffic.members', { n: x.members }) } : { n: '–', sub: '' };
}
function paintTraffic() {
  const x = trafficCache; if (!x) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const nf = n => Number(n).toLocaleString(numberLocale());
  set('visitsN', nf(x.totalVisits)); set('tfTotal', nf(x.totalVisits));
  set('onlineN', x.online);
  if (x.members === undefined) return;   // compteurs détaillés : admin uniquement
  set('tfOnline', x.online); set('tfMembers', t('traffic.members', { n: x.members }));
  set('tfVisitors', nf(x.visitorsToday)); set('tfLogins', x.loginsToday); set('tfPeak', x.peakToday);
}
async function pollTraffic() {
  // Compteurs « en ligne » / visites : réservés à l'administrateur.
  if (!session || session.role !== 'admin' || document.hidden) return;
  try { trafficCache = await api('/api/admin/traffic'); paintTraffic(); } catch (e) { /* silencieux */ }
}
setInterval(pingPresence, 60 * 1000);
setInterval(pollTraffic, 30 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pingPresence(); pollTraffic(); } });

function carQuery() {
  const p = new URLSearchParams();
  if (filters.q) p.set('q', filters.q);
  if (filters.fuel) p.set('fuel', filters.fuel);
  if (filters.maxPrice) p.set('maxPrice', filters.maxPrice);
  if (filters.wilaya) p.set('wilaya', filters.wilaya);
  return p.toString();
}

async function loadCars() { carsCache = (await api('/api/cars?' + carQuery())).cars; }
async function loadWilayas() {
  try { wilayasCache = (await api('/api/cars/wilayas')).wilayas; } catch (e) { wilayasCache = []; }
  // Une wilaya choisie qui n'a plus de concessionnaire n'est plus proposée : on retire le filtre.
  if (filters.wilaya && !wilayasCache.some(w => w.code === filters.wilaya)) filters.wilaya = '';
}
async function loadDealerCars() { carsCache = (await api('/api/cars')).cars.filter(c => c.dealerId === session.id); }
async function loadRequests() { requestsCache = (await api('/api/requests')).requests; }
async function loadMyRequests() { myRequestsCache = (await api('/api/requests/mine')).requests; }
async function loadAnalytics() { analyticsCache = await api('/api/admin/analytics?days=' + analyticsDays); }
async function loadAdmin() {
  const [a, s, st, ms, an, sec] = await Promise.all([
    api('/api/admin/accounts'), api('/api/admin/stats'), api('/api/admin/storage'), api('/api/messages'),
    api('/api/admin/analytics?days=' + analyticsDays), api('/api/admin/security')
  ]);
  accountsCache = a.accounts; statsCache = s; storageCache = st; messagesCache = ms; analyticsCache = an; securityCache = sec;
}

function fmtBytes(n) {
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  return (n / (1024 * 1024)).toFixed(1) + ' Mo';
}

async function loadForView(v) {
  if (v === 'admin' && session && session.role === 'admin') { try { trafficCache = await api('/api/admin/traffic'); } catch (e) { /* ignoré */ } }
  if (v === 'home') { await loadWilayas(); await loadCars(); }
  else if (v === 'dealer-stock') await loadDealerCars();
  else if (v === 'dealer-requests') await loadRequests();
  else if (v === 'user-listings') await loadMyRequests();
  else if (v === 'admin') await loadAdmin();
}

async function goto(v) {
  view = v;
  editingCar = null; editingReq = null; editingAccount = null;
  if (v !== 'contact') contactSent = false;
  formMsg = { login: '', register: '', dealerCar: '', request: '', admin: '', account: '', profile: '', contact: '' };
  document.getElementById('root').innerHTML = `<div class="loading">${t('loading')}</div>`;
  try { await loadForView(v); } catch (e) { console.error(e); }
  render();
}

function changeLang(lang) {
  setLang(lang);
  render();
}

/* =========================================================
   Rendu
   ========================================================= */
function renderLangSwitch() {
  const current = getLang();
  const labels = { fr: 'FR', en: 'EN', ar: 'عربي' };
  return `
  <div class="lang-switch" role="group" aria-label="Langue / Language / اللغة">
    ${SUPPORTED_LANGS.map(l => `<button class="lang-btn ${l === current ? 'active' : ''}" data-action="set-lang" data-lang="${l}">${labels[l]}</button>`).join('')}
  </div>`;
}

function trafficBadges() {
  return `<span class="online-badge" title="${esc(t('traffic.online'))}"><span class="live-dot"></span><b id="onlineN">${trafficHtml().n}</b> ${t('traffic.badge')}</span>
      <span class="online-badge visits" title="${esc(t('traffic.totalVisits'))}">👁 <b id="visitsN">${trafficCache ? Number(trafficCache.totalVisits).toLocaleString(numberLocale()) : '–'}</b> ${t('traffic.visitsWord')}</span>`;
}

function renderHeader() {
  const navHome = `<button class="nav-btn ${view === 'home' ? 'active' : ''}" data-action="go" data-view="home">${t('nav.stock')}</button>`;
  // Contact : accessible à tout le monde, connecté ou non.
  const navContact = `<button class="nav-btn ${view === 'contact' ? 'active' : ''}" data-action="go" data-view="contact">${t('nav.contact')}</button>`;
  // Bouton d'installation : visible tant que le site n'est pas déjà lancé
  // en tant qu'app installée. Selon le navigateur, il déclenche l'invite
  // native ou affiche le mode d'emploi (voir public/js/pwa.js).
  const navInstall = ''; // bouton « Installer l'app » retiré à la demande du propriétaire
  let roleNav = '', userBox = '';
  if (!session) {
    userBox = `<button class="nav-cta" data-action="go" data-view="auth">${t('nav.login')}</button>`;
  } else if (session.role === 'user') {
    roleNav = `
      <button class="nav-btn ${view === 'user-sell' ? 'active' : ''}" data-action="go" data-view="user-sell">${t('nav.sell')}</button>
      <button class="nav-btn ${view === 'user-listings' ? 'active' : ''}" data-action="go" data-view="user-listings">${t('nav.myListings')}</button>
      <button class="nav-btn ${view === 'profile' ? 'active' : ''}" data-action="go" data-view="profile">${t('nav.myProfile')}</button>`;
    userBox = `<div class="nav-user"><div><span class="nav-user-name">${esc(session.name)}</span><span class="nav-user-role">${t('role.user')}</span></div><button class="logout-btn" data-action="logout">${t('nav.logout')}</button></div>`;
  } else if (session.role === 'dealer') {
    roleNav = `
      <button class="nav-btn ${view === 'dealer-stock' ? 'active' : ''}" data-action="go" data-view="dealer-stock">${t('nav.dealerStock')}</button>
      <button class="nav-btn ${view === 'dealer-requests' ? 'active' : ''}" data-action="go" data-view="dealer-requests">${t('nav.dealerRequests')}</button>
      <button class="nav-btn ${view === 'profile' ? 'active' : ''}" data-action="go" data-view="profile">${t('nav.myProfile')}</button>`;
    userBox = `<div class="nav-user"><div><span class="nav-user-name">${esc(session.name)}</span><span class="nav-user-role">${t('role.dealer')}</span></div><button class="logout-btn" data-action="logout">${t('nav.logout')}</button></div>`;
  } else if (session.role === 'admin') {
    roleNav = `
      ${trafficBadges()}
      <button class="nav-btn ${view === 'admin' ? 'active' : ''}" data-action="go" data-view="admin">${t('nav.admin')}</button>
      <button class="nav-btn ${view === 'profile' ? 'active' : ''}" data-action="go" data-view="profile">${t('nav.myProfile')}</button>`;
    userBox = `<div class="nav-user"><div><span class="nav-user-name">${esc(session.name)}</span><span class="nav-user-role">${t('role.admin')}</span></div><button class="logout-btn" data-action="logout">${t('nav.logout')}</button></div>`;
  }
  return `
  <header class="topbar">
    <div class="topbar-inner">
      <a class="logo" href="#" data-action="go" data-view="home"><span class="dot"></span>${t('brand')}</a>
      <button class="burger" data-action="toggle-menu">☰</button>
      <nav class="nav-links" id="navLinks">${navHome}${navContact}${roleNav}${userBox}${navInstall}${renderLangSwitch()}</nav>
    </div>
  </header>`;
}

function renderHome() {
  const list = carsCache.slice().sort((a, b) => b.createdAt - a.createdAt);
  const cards = list.map(c => `
    <div class="card">
      <img class="card-img" src="${esc(c.photo)}" alt="${esc(c.brand + ' ' + c.model)}" data-fallback="${esc(c.brand + ' ' + c.model)}" data-action="open-car" data-id="${c.id}">
      <div class="card-body">
        <span class="tag tag-dealer" style="width:fit-content">${t('home.soldByPro')}</span>
        <div class="card-title">${esc(c.brand)} ${esc(c.model)}</div>
        <div class="card-meta"><span>${c.year}</span><span>·</span><span>${fmtKm(c.km)}</span><span>·</span><span>${esc(c.fuel)}</span></div>
        <div class="card-price">${fmtPrice(c.price)}</div>
        <div class="card-seller">${esc(c.dealerName)} — ${esc(c.city)}</div>
        <button class="card-btn" data-action="open-car" data-id="${c.id}">${t('home.viewListing')}</button>
      </div>
    </div>`).join('');

  return `
    <div class="hero">
      <div class="hero-inner">
        <h1>${t('home.title')}</h1>
        <p>${t('home.subtitle')}</p>
        <div class="search-bar">
          <div class="ac-wrap">
            <input type="text" id="fq" placeholder="${esc(t('home.searchPlaceholder'))}" value="${esc(filters.q)}" autocomplete="off" enterkeyhint="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acList">
            <ul id="acList" class="ac-list" role="listbox" hidden></ul>
          </div>
          <select id="fwilaya" aria-label="${esc(t('home.wilayaPlaceholder'))}">
            <option value="">${t('home.wilayaPlaceholder')}</option>
            ${wilayasCache.map(w => { const wl = WILAYAS.find(x => x[0] === w.code); return wl ? `<option value="${w.code}" ${filters.wilaya === w.code ? 'selected' : ''}>${esc(wilayaLabel(wl))} (${w.cars})</option>` : ''; }).join('')}
          </select>
          <select id="ffuel">
            <option value="">${t('home.fuelPlaceholder')}</option>
            ${FUELS.map(f => `<option value="${f}" ${filters.fuel === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
          <input type="number" id="fprice" placeholder="${esc(t('home.pricePlaceholder'))}" value="${esc(filters.maxPrice)}">
          <button data-action="apply-filters">${t('home.searchBtn')}</button>
        </div>
      </div>
    </div>
    <div class="page">
      <div class="section-head"><h2>${t('home.available')}</h2><span class="count">${list.length} ${plural(list.length, 'home.listingWord')}</span></div>
      ${list.length ? `<div class="grid">${cards}</div>` : `<div class="empty"><div class="badge-empty-icon">🚗</div><h3>${t('home.emptyTitle')}</h3><p>${t('home.emptyDesc')}</p></div>`}
    </div>`;
}

function renderAuth() {
  return `
  <div class="page login-wrap">
    <div class="panel">
      <div class="tabs">
        <button class="tab ${authTab === 'login' ? 'active' : ''}" data-action="auth-tab" data-tab="login">${t('auth.login')}</button>
        <button class="tab ${authTab === 'register' ? 'active' : ''}" data-action="auth-tab" data-tab="register">${t('auth.register')}</button>
      </div>
      ${authTab === 'login' ? `
        ${formMsg.login ? `<div class="form-msg err">${esc(formMsg.login)}</div>` : ''}
        <form data-form="login">
          <div class="field"><label>${t('auth.username')}</label><input name="username" required></div>
          <div class="field"><label>${t('auth.password')}</label><input type="password" name="password" required></div>
          <button class="btn-primary" type="submit" style="width:100%" ${busy ? 'disabled' : ''}>${t('auth.loginBtn')}</button>
        </form>
        <p class="switch-role">${t('auth.dealerNote')}</p>
      ` : `
        ${formMsg.register ? `<div class="form-msg err">${esc(formMsg.register)}</div>` : ''}
        <form data-form="register">
          <div class="field"><label>${t('auth.fullName')}</label><input name="name" required></div>
          <div class="field-row">
            <div class="field"><label>${t('auth.username')}</label><input name="username" required></div>
            <div class="field"><label>${t('auth.password')}</label><input type="password" name="password" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label>${t('auth.phone')}</label><input name="phone" type="tel" required pattern="[+]?[0-9\\s.()-]{8,20}" title="${esc(t('auth.phoneHint'))}" placeholder="${esc(t('auth.phonePlaceholder'))}"></div>
            <div class="field"><label>${t('auth.email')}</label><input type="email" name="email" placeholder="${esc(t('auth.emailPlaceholder'))}"></div>
          </div>
          <div class="field"><label>${t('auth.city')}</label><input name="city" placeholder="${esc(t('auth.cityPlaceholder'))}"></div>
          <button class="btn-primary" type="submit" style="width:100%" ${busy ? 'disabled' : ''}>${t('auth.registerBtn')}</button>
        </form>
      `}
    </div>
  </div>`;
}

function photoField(existingUrl) {
  return `
  <div class="field">
    <label>${t('photo.label')}</label>
    <div class="photo-input">
      <img class="photo-preview" id="photoPreview" src="${existingUrl ? esc(existingUrl) : 'https://placehold.co/160x120/E2E4EA/66707D?text=Photo'}" data-fallback="Photo">
      <div>
        <input type="file" name="photo" accept="image/*" id="photoInput">
        <div class="hint">${t('photo.hint')} ${existingUrl ? t('photo.keepCurrent') : ''}</div>
      </div>
    </div>
  </div>`;
}

// Trois emplacements photo pour un véhicule : extérieur, intérieur, côté.
const CAR_PHOTO_SLOTS = [
  { field: 'photo', key: 'photo.exterior' },
  { field: 'photo_interior', key: 'photo.interior' },
  { field: 'photo_side', key: 'photo.side' }
];
function carPhotosField(photos) {
  const cur = photos || ['', '', ''];
  return `
  <div class="field">
    <label>${t('photo.carLabel')}</label>
    <div class="hint" style="margin-bottom:8px">${t('photo.carHint')}</div>
    <div class="car-photo-slots">
      ${CAR_PHOTO_SLOTS.map((s, i) => `
      <div class="car-photo-slot">
        <div class="car-photo-slot-title">${t(s.key)}</div>
        <img class="photo-preview car-photo-preview" id="preview_${s.field}" src="${cur[i] ? esc(cur[i]) : 'https://placehold.co/160x120/E2E4EA/66707D?text=' + encodeURIComponent(t(s.key))}" data-fallback="${esc(t(s.key))}">
        <input type="file" name="${s.field}" accept="image/*" data-preview="preview_${s.field}">
        ${cur[i] ? `<label class="car-photo-remove"><input type="checkbox" name="remove_${s.field}" value="1"> ${t('photo.remove')}</label>` : ''}
      </div>`).join('')}
    </div>
  </div>`;
}

function renderDealerStockForm() {
  const c = editingCar;
  return `
  <div class="panel" style="margin-bottom:26px;max-width:100%">
    <h3 style="margin-top:0">${c ? t('dealerCar.editTitle') : t('dealerCar.addTitle')}</h3>
    ${formMsg.dealerCar ? `<div class="form-msg err">${esc(formMsg.dealerCar)}</div>` : ''}
    <form data-form="dealer-car" data-id="${c ? c.id : ''}" enctype="multipart/form-data">
      <div class="field-row">
        <div class="field"><label>${t('field.brand')}</label>
          <div class="ac-wrap brand-ac-wrap">
            <input name="brand" required autocomplete="off" data-brand-ac role="combobox" aria-autocomplete="list" aria-expanded="false" value="${esc(c ? c.brand : '')}">
            <ul class="ac-list" id="brandAcList" role="listbox" hidden></ul>
          </div>
          <div class="hint" id="brandNote">${t('brand.hint')}</div>
        </div>
        <div class="field"><label>${t('field.model')}</label><input name="model" required value="${esc(c ? c.model : '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>${t('field.year')}</label><input type="number" name="year" required value="${c ? c.year : ''}"></div>
        <div class="field"><label>${t('field.km')}</label><input type="number" name="km" required value="${c ? c.km : ''}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>${t('field.price')}</label><input type="number" name="price" required value="${c ? c.price : ''}"></div>
        <div class="field"><label>${t('field.color')}</label><input name="color" value="${esc(c ? c.color : '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>${t('field.fuel')}</label><select name="fuel">${FUELS.map(f => `<option ${c && c.fuel === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>${t('field.gearbox')}</label><select name="gearbox">${GEARBOX.map(f => `<option ${c && c.gearbox === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>${t('field.city')}</label><input name="city" required value="${esc(c ? c.city : (session.city || ''))}"></div>
      ${carPhotosField(c ? c.photos : null)}
      <div class="field"><label>${t('field.description')}</label><textarea name="description" rows="3">${esc(c ? c.description : '')}</textarea></div>
      <div class="field-row">
        <div class="field"><label>${t('field.contactName')}</label><input name="contactName" value="${esc(c ? c.contactName : session.name)}"></div>
        <div class="field"><label>${t('field.contactPhone')}</label><input name="contactPhone" required value="${esc(c ? c.contactPhone : (session.phone || ''))}"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${c ? t('common.save') : t('dealerCar.publish')}</button>
        ${c ? `<button type="button" class="btn-secondary" data-action="cancel-edit-car">${t('common.cancel')}</button>` : ''}
      </div>
    </form>
  </div>`;
}

function renderDealerStock() {
  const mine = carsCache.slice().sort((a, b) => b.createdAt - a.createdAt);
  const rows = mine.map(c => `
    <div class="list-row">
      <img src="${esc(c.photo)}" data-fallback="${esc(c.brand)}">
      <div class="info">
        <h4>${esc(c.brand)} ${esc(c.model)} — ${c.year}</h4>
        <p>${fmtPrice(c.price)} · ${fmtKm(c.km)} · ${esc(c.fuel)} · ${esc(c.city)}</p>
      </div>
      <div class="actions">
        <button class="btn-secondary" data-action="edit-car" data-id="${c.id}">${t('common.edit')}</button>
        <button class="btn-danger" data-action="delete-car" data-id="${c.id}">${t('common.delete')}</button>
      </div>
    </div>`).join('');
  return `
  <div class="page">
    <div class="section-head"><h2>${t('dealerStock.title')}</h2><span class="count">${mine.length} ${plural(mine.length, 'vehicleWord')} ${t('dealerStock.onlineSuffix')}</span></div>
    ${renderDealerStockForm()}
    ${mine.length ? rows : `<div class="empty"><div class="badge-empty-icon">🚙</div><h3>${t('dealerStock.emptyTitle')}</h3><p>${t('dealerStock.emptyDesc')}</p></div>`}
  </div>`;
}

function renderDealerRequests() {
  const list = requestsCache.slice().sort((a, b) => b.createdAt - a.createdAt);
  const rows = list.map(r => `
    <div class="list-row" data-action="open-request" data-id="${r.id}" style="cursor:pointer">
      <img src="${esc(r.photo)}" data-fallback="${esc(r.brand)}">
      <div class="info">
        <h4>${esc(r.brand)} ${esc(r.model)} — ${r.year} <span class="tag tag-private">${t('tag.private')}</span></h4>
        <p>${fmtPrice(r.price)} · ${fmtKm(r.km)} · ${esc(r.city)} · ${t('dealerReq.proposedBy', { name: esc(r.ownerName) })}</p>
      </div>
    </div>`).join('');
  return `
  <div class="page">
    <div class="section-head"><h2>${t('dealerReq.title')}</h2><span class="count">${list.length}</span></div>
    <div class="demo-note">${t('dealerReq.note')}</div>
    ${list.length ? rows : `<div class="empty"><div class="badge-empty-icon">📭</div><h3>${t('dealerReq.emptyTitle')}</h3><p>${t('dealerReq.emptyDesc')}</p></div>`}
  </div>`;
}

function renderUserSell() {
  const r = editingReq;
  return `
  <div class="page">
    <div class="section-head"><h2>${t('userSell.title')}</h2></div>
    <div class="demo-note">${t('userSell.note')}</div>
    <div class="panel" style="max-width:100%">
      ${formMsg.request ? `<div class="form-msg err">${esc(formMsg.request)}</div>` : ''}
      <form data-form="request" data-id="${r ? r.id : ''}" enctype="multipart/form-data">
        <div class="field-row">
          <div class="field"><label>${t('field.brand')}</label><input name="brand" required value="${esc(r ? r.brand : '')}"></div>
          <div class="field"><label>${t('field.model')}</label><input name="model" required value="${esc(r ? r.model : '')}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>${t('field.year')}</label><input type="number" name="year" required value="${r ? r.year : ''}"></div>
          <div class="field"><label>${t('field.km')}</label><input type="number" name="km" required value="${r ? r.km : ''}"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>${t('field.priceWanted')}</label><input type="number" name="price" required value="${r ? r.price : ''}"></div>
          <div class="field"><label>${t('field.fuel')}</label><select name="fuel">${FUELS.map(f => `<option ${r && r.fuel === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>${t('field.city')}</label><input name="city" required value="${esc(r ? r.city : (session.city || ''))}"></div>
          <div class="field"><label>${t('field.phoneContact')}</label><input name="phone" required value="${esc(r ? r.phone : (session.phone || ''))}"></div>
        </div>
        ${photoField(r ? r.photo : '')}
        <div class="field"><label>${t('field.description')}</label><textarea name="description" rows="3">${esc(r ? r.description : '')}</textarea></div>
        <div style="display:flex;gap:10px">
          <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${r ? t('common.save') : t('userSell.publish')}</button>
          ${r ? `<button type="button" class="btn-secondary" data-action="cancel-edit-req">${t('common.cancel')}</button>` : ''}
        </div>
      </form>
    </div>
  </div>`;
}

function renderUserListings() {
  const mine = myRequestsCache.slice().sort((a, b) => b.createdAt - a.createdAt);
  const rows = mine.map(r => `
    <div class="list-row">
      <img src="${esc(r.photo)}" data-fallback="${esc(r.brand)}">
      <div class="info">
        <h4>${esc(r.brand)} ${esc(r.model)} — ${r.year}</h4>
        <p>${fmtPrice(r.price)} · ${fmtKm(r.km)} · ${t('userListings.visibleNote')}</p>
      </div>
      <div class="actions">
        <button class="btn-secondary" data-action="edit-req" data-id="${r.id}">${t('common.edit')}</button>
        <button class="btn-danger" data-action="delete-req" data-id="${r.id}">${t('common.delete')}</button>
      </div>
    </div>`).join('');
  return `
  <div class="page">
    <div class="section-head"><h2>${t('userListings.title')}</h2><span class="count">${mine.length}</span></div>
    ${mine.length ? rows : `<div class="empty"><div class="badge-empty-icon">🗂️</div><h3>${t('userListings.emptyTitle')}</h3><p>${t('userListings.emptyDesc')}</p></div>`}
  </div>`;
}

function renderAccountEditForm() {
  const a = editingAccount;
  if (!a) return '';
  const isDealer = a.role === 'dealer';
  return `
  <div class="panel" style="margin-bottom:26px;max-width:100%">
    <h3 style="margin-top:0">${t('account.editTitle', { name: esc(a.name) })} <span class="tag ${isDealer ? 'tag-dealer' : 'tag-private'}" style="margin-left:6px">${isDealer ? t('role.dealer') : t('role.user')}</span></h3>
    ${formMsg.account ? `<div class="form-msg err">${esc(formMsg.account)}</div>` : ''}
    <form data-form="edit-account" data-id="${a.id}">
      <div class="field-row">
        <div class="field"><label>${t('field.name')}</label><input name="name" required value="${esc(a.name)}"></div>
        <div class="field"><label>${t('auth.username')}</label><input name="username" required value="${esc(a.username)}"></div>
      </div>
      <div class="field-row">
        ${isDealer ? `<div class="field"><label>${t('field.wilaya')}</label>${wilayaSelect(a.wilaya || '')}</div>` : ''}
        <div class="field"><label>${t('field.city')}</label><input name="city" value="${esc(a.city || '')}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>${t('auth.phone')}</label><input name="phone" value="${esc(a.phone || '')}"></div>
      </div>
      <div class="field">
        <label>${t('field.newPassword')}</label>
        <input type="password" name="password" placeholder="${esc(t('account.newPasswordPlaceholder'))}">
        <div class="hint">${t('account.passwordHint')}</div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${t('common.save')}</button>
        <button type="button" class="btn-secondary" data-action="cancel-edit-account">${t('common.cancel')}</button>
      </div>
    </form>
  </div>`;
}

function renderContact() {
  // Après un envoi réussi, on remplace le formulaire par un accusé de
  // réception plutôt que de le laisser rempli : ça évite les doubles envois
  // par rechargement ou double-clic.
  if (contactSent) {
    return `
    <div class="page login-wrap">
      <div class="section-head"><h2>${t('contact.title')}</h2></div>
      <div class="panel">
        <div class="form-msg ok">${t('contact.sent')}</div>
        <button class="btn-secondary" data-action="contact-reset">${t('contact.sendAnother')}</button>
      </div>
    </div>`;
  }

  // Si la personne est connectée, on pré-remplit ses coordonnées : un
  // formulaire de contact ne devrait pas lui faire retaper ce qu'on sait déjà.
  const pre = session || {};
  return `
  <div class="page login-wrap">
    <div class="section-head"><h2>${t('contact.title')}</h2></div>
    <div class="panel">
      <p class="hint" style="margin:-4px 0 16px">${t('contact.intro')}</p>
      ${formMsg.contact ? `<div class="form-msg err">${esc(formMsg.contact)}</div>` : ''}
      <form data-form="contact">
        <div class="field"><label>${t('contact.yourName')}</label><input name="name" required maxlength="100" value="${esc(pre.name || '')}"></div>
        <div class="field-row">
          <div class="field"><label>${t('auth.email')}</label><input type="email" name="email" maxlength="150" placeholder="${esc(t('auth.emailPlaceholder'))}" value="${esc(pre.email || '')}"></div>
          <div class="field"><label>${t('auth.phone')}</label><input type="tel" name="phone" maxlength="30" pattern="[+]?[0-9\\s.()-]{8,20}" title="${esc(t('auth.phoneHint'))}" placeholder="${esc(t('auth.phonePlaceholder'))}" value="${esc(pre.phone || '')}"></div>
        </div>
        <div class="hint" style="margin:-6px 0 14px">${t('contact.contactHint')}</div>
        <div class="field"><label>${t('contact.subject')}</label><input name="subject" maxlength="150" placeholder="${esc(t('contact.subjectPlaceholder'))}"></div>
        <div class="field"><label>${t('contact.message')}</label><textarea name="message" rows="6" required maxlength="2000" placeholder="${esc(t('contact.messagePlaceholder'))}"></textarea></div>
        <button class="btn-primary" type="submit" style="width:100%" ${busy ? 'disabled' : ''}>${t('contact.send')}</button>
      </form>
    </div>
  </div>`;
}

function renderProfile() {
  const roleLabel = session.role === 'admin' ? t('role.admin.full') : session.role === 'dealer' ? t('role.dealer') : t('role.user');
  return `
  <div class="page login-wrap">
    <div class="section-head"><h2>${t('profile.title')}</h2></div>
    <div class="panel">
      ${formMsg.profile ? `<div class="form-msg ${formMsg.profile.startsWith('OK:') ? 'ok' : 'err'}">${esc(formMsg.profile.replace('OK:', ''))}</div>` : ''}
      <div class="demo-note">${t('profile.accountLabel', { role: esc(roleLabel), username: `<b>${esc(session.username)}</b>` })}</div>
      <form data-form="profile">
        ${(() => {
          const fName = `<div class="field"><label>${t('field.name')}</label><input name="name" required value="${esc(session.name)}"></div>`;
          const fWil = `<div class="field"><label>${t('field.wilaya')}</label>${wilayaSelect(session.wilaya || '')}</div>`;
          const fCity = `<div class="field"><label>${t('field.city')}</label><input name="city" value="${esc(session.city || '')}"></div>`;
          const fPhone = `<div class="field"><label>${t('auth.phone')}</label><input name="phone" type="tel" required pattern="[+]?[0-9\\s.()-]{8,20}" title="${esc(t('auth.phoneHint'))}" value="${esc(session.phone || '')}"></div>`;
          const fMail = `<div class="field"><label>${t('auth.email')}</label><input type="email" name="email" value="${esc(session.email || '')}"></div>`;
          return session.role === 'dealer'
            ? `<div class="field-row">${fName}${fWil}</div><div class="field-row">${fCity}${fPhone}</div><div class="field-row">${fMail}</div>`
            : `<div class="field-row">${fName}${fCity}</div><div class="field-row">${fPhone}${fMail}</div>`;
        })()}
        <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
        <div class="field"><label>${t('field.currentPassword')}</label><input type="password" name="currentPassword" placeholder="${esc(t('profile.currentPasswordPlaceholder'))}"></div>
        <div class="field"><label>${t('field.newPassword')}</label><input type="password" name="newPassword" placeholder="${esc(t('profile.newPasswordPlaceholder'))}"></div>
        <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${t('common.save')}</button>
      </form>
    </div>
    ${session.role !== 'admin' ? `
    <div class="panel" style="margin-top:16px">
      <h3>${t('profile.deleteTitle')}</h3>
      <div class="demo-note">${t('profile.deleteHelp')}</div>
      <div class="field"><label>${t('profile.deletePwd')}</label><input type="password" id="delPwd" autocomplete="current-password"></div>
      <button class="btn-primary" style="background:#b3261e" data-action="delete-my-account" ${busy ? 'disabled' : ''}>${t('profile.deleteBtn')}</button>
    </div>` : ''}
  </div>`;
}

// ---- Statistiques admin (graphiques en HTML/SVG pur : pas de lib externe, compatible CSP) ----
function hbars(items) {
  if (!items.length) return `<div class="hint">${t('analytics.empty')}</div>`;
  const max = Math.max(...items.map(i => i.pct), 1);
  return items.map(i => `
    <div class="hbar">
      <span class="lab" title="${esc(i.label)}">${esc(i.label)}</span>
      <span class="track"><span class="fill" style="width:${(i.pct / max * 100).toFixed(1)}%"></span></span>
      <span class="val">${i.pct}% <small>(${i.count})</small></span>
    </div>`).join('');
}

function barsSvg(values, labels, color) {
  const W = 300, H = 90, n = values.length, max = Math.max(...values, 1);
  const bw = W / n;
  const bars = values.map((v, i) => {
    const h = Math.round(v / max * (H - 14));
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${H - h}" width="${Math.max(bw - 2, 1).toFixed(1)}" height="${h}" rx="1.5" fill="${color}"><title>${esc(labels[i])} : ${v}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" preserveAspectRatio="none" style="display:block;height:90px">${bars}</svg>
    <div class="hint" style="display:flex;justify-content:space-between;margin-top:4px"><span>${esc(labels[0])}</span><span>max ${max}</span><span>${esc(labels[n - 1])}</span></div>`;
}

function renderAnalyticsPanel() {
  const a = analyticsCache;
  if (!a) return '';
  const sr = a.searches;
  const pctNone = sr.total ? Math.round(sr.noResult * 100 / sr.total) : 0;
  const termList = list => list.length
    ? list.map(x => `<div class="hbar"><span class="lab" style="width:auto;flex:1" title="${esc(x.term)}">${esc(x.term)}</span><span class="val">${x.n}${x.zero ? ` <small>(${x.zero} ✗)</small>` : ''}</span></div>`).join('')
    : `<div class="hint">${t('analytics.empty')}</div>`;
  const brandItems = sr.brands.map(b => ({ label: b.brand, count: b.count, pct: b.pct }));

  return `
    <div class="section-head">
      <h3 style="margin:0">${t('analytics.title')}</h3>
      <span style="display:flex;gap:6px">
        ${[7, 30, 90].map(d => `<button class="${a.days === d ? 'btn-primary' : 'btn-secondary'}" data-action="analytics-days" data-days="${d}">${t('analytics.daysBtn', { n: d })}</button>`).join('')}
      </span>
    </div>
    <div class="stat-row">
      <div class="stat live"><div class="n"><span class="live-dot"></span><span id="tfOnline">${trafficCache ? trafficCache.online : '–'}</span></div><div class="l">${t('traffic.online')} <small id="tfMembers">${trafficCache ? t('traffic.members', { n: trafficCache.members }) : ''}</small></div></div>
      <div class="stat total"><div class="n" id="tfTotal">${trafficCache ? Number(trafficCache.totalVisits).toLocaleString(numberLocale()) : '–'}</div><div class="l">${t('traffic.totalVisits')}</div></div>
      <div class="stat"><div class="n" id="tfVisitors">${trafficCache ? trafficCache.visitorsToday : '–'}</div><div class="l">${t('traffic.visitorsToday')}</div></div>
      <div class="stat"><div class="n" id="tfLogins">${trafficCache ? trafficCache.loginsToday : '–'}</div><div class="l">${t('traffic.loginsToday')}</div></div>
      <div class="stat"><div class="n" id="tfPeak">${trafficCache ? trafficCache.peakToday : '–'}</div><div class="l">${t('traffic.peakToday')}</div></div>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="n">${sr.total}</div><div class="l">${t('analytics.searchesTotal')}</div></div>
      <div class="stat"><div class="n">${sr.noResult} <small style="font-size:14px">(${pctNone}%)</small></div><div class="l">${t('analytics.noResult')}</div></div>
      <div class="stat"><div class="n">${sr.unmatched}</div><div class="l">${t('analytics.unmatched')}</div></div>
    </div>
    <div class="an-grid">
      <div class="an-card"><h4>${t('analytics.searchesByBrand')}</h4>${hbars(brandItems)}</div>
      <div class="an-card"><h4>${t('analytics.visitorsPerDay')}</h4>${barsSvg(a.visitorsPerDay, a.labels, '#14684A')}</div>
      <div class="an-card"><h4>${t('analytics.loginsPerDay')}</h4>${barsSvg(a.loginsPerDay, a.labels, '#D7282F')}</div>
      <div class="an-card"><h4>${t('analytics.searchesPerDay')}</h4>${barsSvg(sr.perDay, a.labels, '#E2531F')}</div>
      <div class="an-card"><h4>${t('analytics.signupsPerDay')}</h4>${barsSvg(a.signupsPerDay, a.labels, '#1C3661')}</div>
      <div class="an-card"><h4>${t('analytics.stockByBrand')}</h4>${hbars(a.stockByBrand)}</div>
      <div class="an-card"><h4>${t('analytics.requestsByBrand')}</h4>${hbars(a.requestsByBrand)}</div>
      <div class="an-card"><h4>${t('analytics.stockByFuel')}</h4>${hbars(a.stockByFuel)}</div>
      <div class="an-card"><h4>${t('analytics.topTerms')}</h4>${termList(a.topTerms)}</div>
      <div class="an-card"><h4>${t('analytics.missedTerms')}</h4>${termList(a.missedTerms)}</div>
    </div>
    <div class="hint" style="margin:-8px 0 26px">${t('analytics.hint')}</div>`;
}

// ---- Sécurité & visiteurs (IP) — admin ----
function fmtDateTime(ts) { return ts ? new Date(ts).toLocaleString() : '—'; }

function secHead(titleKey, scope, mt) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin:${mt}px 0 8px">
    <h4 style="margin:0">${t(titleKey)}</h4>
    <button class="btn-danger" data-action="security-clear" data-scope="${scope}">${t('security.clear')}</button></div>`;
}

function renderSecurityPanel() {
  const sc = securityCache;
  if (!sc) return '';
  const badText = bad => Object.entries(bad || {}).map(([k, n]) => `${t('security.type.' + k)} ×${n}`).join(', ') || '—';
  const ipCell = x => `<td><code>${esc(x.ip)}</code>${x.you ? ` <span class="tag tag-private">${t('security.you')}</span>` : ''}</td>`;
  const suspiciousRows = sc.suspicious.map(x => `
    <tr class="row-alert">${ipCell(x)}<td><b>${x.score}</b></td><td>${esc(badText(x.bad))}</td><td>${x.hits}</td><td>${fmtDateTime(x.last)}</td><td class="ua">${esc(x.ua)}</td></tr>`).join('');
  const visitorRows = sc.visitors.map(x => `
    <tr>${ipCell(x)}<td>${x.hits}</td><td>${fmtDateTime(x.first)}</td><td>${fmtDateTime(x.last)}</td><td>${x.score >= 5 ? `<span class="tag tag-dealer">${x.score}</span>` : (x.score || '')}</td><td class="ua">${esc(x.ua)}</td></tr>`).join('');
  const eventRows = sc.events.map(e => `
    <tr><td>${fmtDateTime(e.t)}</td><td><code>${esc(e.ip)}</code></td><td>${t('security.type.' + e.type)}</td><td class="ua">${esc(e.path)}</td></tr>`).join('');
  const empty = cols => `<tr><td colspan="${cols}">${t('security.empty')}</td></tr>`;

  return `
    <div class="section-head"><h3 style="margin:0">${t('security.title')}</h3>
      <button class="btn-danger" data-action="security-clear" data-scope="all">${t('security.clearAll')}</button></div>
    <div class="stat-row">
      <div class="stat"><div class="n">${sc.totals.uniqueIps}</div><div class="l">${t('security.uniqueIps')}</div></div>
      <div class="stat"><div class="n">${sc.totals.active24h}</div><div class="l">${t('security.active24h')}</div></div>
      <div class="stat"><div class="n" style="color:${sc.totals.suspicious ? '#b3261e' : 'inherit'}">${sc.totals.suspicious}</div><div class="l">${t('security.suspicious')}</div></div>
      <div class="stat"><div class="n">${sc.totals.events24h}</div><div class="l">${t('security.events24h')}</div></div>
    </div>

    ${secHead('security.suspiciousTitle', 'suspicious', 18)}
    <div class="table-wrap" style="max-height:340px;overflow:auto"><table>
      <thead><tr><th>${t('security.col.ip')}</th><th>${t('security.col.score')}</th><th>${t('security.col.details')}</th><th>${t('security.col.hits')}</th><th>${t('security.col.last')}</th><th>${t('security.col.ua')}</th></tr></thead>
      <tbody>${suspiciousRows || empty(6)}</tbody></table></div>

    ${secHead('security.eventsTitle', 'incidents', 22)}
    <div class="table-wrap" style="max-height:300px;overflow:auto"><table>
      <thead><tr><th>${t('security.col.time')}</th><th>${t('security.col.ip')}</th><th>${t('security.col.type')}</th><th>${t('security.col.path')}</th></tr></thead>
      <tbody>${eventRows || empty(4)}</tbody></table></div>

    ${secHead('security.visitorsTitle', 'visitors', 22)}
    <div class="table-wrap" style="max-height:420px;overflow:auto"><table>
      <thead><tr><th>${t('security.col.ip')}</th><th>${t('security.col.hits')}</th><th>${t('security.col.first')}</th><th>${t('security.col.last')}</th><th>${t('security.col.score')}</th><th>${t('security.col.ua')}</th></tr></thead>
      <tbody>${visitorRows || empty(6)}</tbody></table></div>
    <div class="hint" style="margin:10px 0 26px">${t('security.hint', { n: sc.totals.retentionDays })}</div>`;
}

function renderAdmin() {


  const rows = accountsCache.map(a => `
    <tr>
      <td>${esc(a.name)}</td>
      <td>${esc(a.username)}</td>
      <td><span class="tag ${a.role === 'dealer' ? 'tag-dealer' : 'tag-private'}">${a.role === 'dealer' ? t('role.dealer') : t('role.user')}</span></td>
      <td>${esc(a.city || '—')}</td>
      <td>${esc(a.phone || '—')}</td>
      <td>${a.listingsCount} ${plural(a.listingsCount, a.role === 'dealer' ? 'vehicleWord' : 'home.listingWord')}</td>
      <td style="display:flex;gap:6px">
        <button class="btn-secondary" data-action="edit-account" data-id="${a.id}">${t('common.edit')}</button>
        <button class="btn-danger" data-action="delete-account" data-id="${a.id}">${t('common.delete')}</button>
      </td>
    </tr>`).join('');

  return `
  <div class="page">
    <div class="section-head"><h2>${t('admin.title')}</h2></div>
    <div class="stat-row">
      <div class="stat"><div class="n">${statsCache.dealers}</div><div class="l">${t('admin.stat.dealers')}</div></div>
      <div class="stat"><div class="n">${statsCache.users}</div><div class="l">${t('admin.stat.users')}</div></div>
      <div class="stat"><div class="n">${statsCache.cars}</div><div class="l">${t('admin.stat.cars')}</div></div>
      <div class="stat"><div class="n">${statsCache.requests}</div><div class="l">${t('admin.stat.requests')}</div></div>
      <div class="stat"><div class="n">${messagesCache.unreadCount}</div><div class="l">${t('admin.stat.messages')}</div></div>
    </div>

    ${renderAnalyticsPanel()}

    ${renderSecurityPanel()}

    <div class="panel" style="margin-bottom:26px;">
      <h3 style="margin-top:0">${t('admin.createDealerTitle')}</h3>
      <div class="hint" style="margin:-6px 0 14px">${t('admin.createDealerHint')}</div>
      ${formMsg.admin ? `<div class="form-msg ${formMsg.admin.startsWith('OK:') ? 'ok' : 'err'}">${esc(formMsg.admin.replace('OK:', ''))}</div>` : ''}
      <form data-form="create-dealer">
        <div class="field"><label>${t('field.dealerName')}</label><input name="name" required placeholder="${esc(t('field.dealerNamePlaceholder'))}"></div>
        <div class="field-row">
          <div class="field"><label>${t('auth.username')}</label><input name="username" required></div>
          <div class="field"><label>${t('auth.password')}</label><input name="password" required></div>
        </div>
        <div class="field-row">
          <div class="field"><label>${t('field.wilaya')}</label>${wilayaSelect('')}</div>
          <div class="field"><label>${t('field.city')}</label><input name="city"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>${t('auth.phone')}</label><input name="phone"></div>
        </div>
        <button class="btn-primary" type="submit" ${busy ? 'disabled' : ''}>${t('admin.createDealerBtn')}</button>
      </form>
    </div>

    ${renderAccountEditForm()}

    <div class="section-head"><h3 style="margin:0">${t('admin.allAccounts')}</h3><span class="count">${accountsCache.length}</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t('table.name')}</th><th>${t('table.username')}</th><th>${t('table.type')}</th><th>${t('table.city')}</th><th>${t('table.phone')}</th><th>${t('table.activity')}</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7">${t('admin.noAccounts')}</td></tr>`}</tbody>
      </table>
    </div>

    ${renderMessagesPanel()}

    ${renderStoragePanel()}
  </div>`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString(numberLocale(), {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function renderMessagesPanel() {
  const list = messagesCache.messages;
  const rows = list.map(m => `
    <div class="msg-card ${m.read ? '' : 'unread'}">
      <div class="msg-head">
        <div>
          <strong>${esc(m.subject || t('msg.noSubject'))}</strong>
          ${m.read ? '' : `<span class="tag tag-private">${t('msg.unread')}</span>`}
        </div>
        <span class="msg-date">${fmtDate(m.createdAt)}</span>
      </div>
      <div class="msg-from">
        ${esc(m.name)}
        ${m.email ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}
        ${m.phone ? ` · <a href="tel:${esc(m.phone.replace(/\\s/g, ''))}">${esc(m.phone)}</a>` : ''}
        <span class="msg-origin">(${m.userId ? t('msg.fromAccount', { username: esc(m.username || '#' + m.userId) }) : t('msg.anonymous')})</span>
      </div>
      <p class="msg-body">${esc(m.message)}</p>
      <div class="msg-actions">
        <button class="btn-secondary" data-action="toggle-msg-read" data-id="${m.id}" data-read="${m.read ? '0' : '1'}">
          ${m.read ? t('msg.markUnread') : t('msg.markRead')}
        </button>
        <button class="btn-danger" data-action="delete-message" data-id="${m.id}">${t('common.delete')}</button>
      </div>
    </div>`).join('');

  return `
    <div class="section-head" style="margin-top:26px">
      <h3 style="margin:0">${t('admin.messagesTitle')}</h3>
      <span class="count">${list.length}</span>
    </div>
    ${list.length ? `<div class="msg-list">${rows}</div>`
      : `<div class="empty"><div class="badge-empty-icon">✉️</div><h3>${t('admin.messagesEmpty')}</h3><p>${t('admin.messagesEmptyDesc')}</p></div>`}
  `;
}

function renderStoragePanel() {
  const photoRows = storageCache.photos.map(p => `
    <tr>
      <td><img src="${esc(p.photo)}" style="width:64px;height:44px;object-fit:cover;border-radius:6px" data-fallback="photo"></td>
      <td>${esc(p.label)}</td>
      <td>${p.type === 'car' ? t('storage.typeVehicle') : t('storage.typePrivateListing')}</td>
      <td>${fmtBytes(p.sizeBytes)}</td>
      <td style="display:flex;gap:6px">
        <button class="btn-secondary" data-action="delete-photo" data-type="${p.type}" data-id="${p.id}" data-slot="${p.slot || 0}">${t('storage.removePhoto')}</button>
        <button class="btn-danger" data-action="delete-listing" data-type="${p.type}" data-id="${p.id}">${t('storage.deleteListing')}</button>
      </td>
    </tr>`).join('');

  return `
    <div class="section-head" style="margin-top:26px"><h3 style="margin:0">${t('storage.title')}</h3></div>
    <div class="panel" style="margin-bottom:16px">
      <div class="hint" style="margin:0">${t('storage.hint')}</div>
      <div class="stat-row" style="margin-top:14px">
        <div class="stat"><div class="n">${storageCache.filesOnDisk}</div><div class="l">${t('storage.filesOnDisk')}</div></div>
        <div class="stat"><div class="n">${fmtBytes(storageCache.bytesOnDisk)}</div><div class="l">${t('storage.spaceUsed')}</div></div>
        <div class="stat"><div class="n">${storageCache.orphanFiles}</div><div class="l">${t('storage.orphanFiles')}</div></div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t('table.photo')}</th><th>${t('table.listing')}</th><th>${t('table.type')}</th><th>${t('table.size')}</th><th></th></tr></thead>
        <tbody>${photoRows || `<tr><td colspan="5">${t('storage.noPhotos')}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// Galerie de la fiche véhicule : grande photo + miniatures (extérieur, intérieur, côté).
function carGallery(c) {
  const slots = (c.photos && c.photos.length ? c.photos : [c.photo || '', '', '']);
  const items = CAR_PHOTO_SLOTS.map((s, i) => ({ url: slots[i], label: t(s.key) })).filter(x => x.url);
  const alt = esc(c.brand + ' ' + c.model);
  if (!items.length) {
    return `<img class="gallery-main" style="height:320px;object-fit:cover;width:100%" src="${esc(c.photo || '')}" data-fallback="${alt}">`;
  }
  const thumbs = items.length > 1 ? `
    <div class="gallery-thumbs">
      ${items.map((x, i) => `
      <button type="button" class="gallery-thumb ${i === 0 ? 'active' : ''}" data-action="gallery-pick" data-src="${esc(x.url)}" aria-label="${esc(x.label)}">
        <img src="${esc(x.url)}" alt="${esc(x.label)}" data-fallback="${esc(x.label)}">
        <span>${esc(x.label)}</span>
      </button>`).join('')}
    </div>` : '';
  return `
  <div class="gallery">
    <img id="galleryMain" class="gallery-main" src="${esc(items[0].url)}" alt="${alt}" data-fallback="${alt}">
    ${thumbs}
  </div>`;
}

function renderModal() {
  if (!modalData) return '';
  if (modalData.type === 'car') {
    const c = modalData.data;
    return `
    <div class="overlay" data-action="close-modal">
      <div class="modal" onclick="event.stopPropagation()">
        ${carGallery(c)}
        <div class="modal-body">
          <button class="modal-close" data-action="close-modal">×</button>
          <div class="modal-top">
            <div><span class="tag tag-dealer">${t('modal.soldByPro')}</span><h2 style="margin:6px 0 2px">${esc(c.brand)} ${esc(c.model)}</h2></div>
            <div class="modal-price">${fmtPrice(c.price)}</div>
          </div>
          <div class="spec-grid">
            <div class="spec"><div class="k">${t('spec.year')}</div><div class="v">${c.year}</div></div>
            <div class="spec"><div class="k">${t('spec.km')}</div><div class="v">${fmtKm(c.km)}</div></div>
            <div class="spec"><div class="k">${t('spec.fuel')}</div><div class="v">${esc(c.fuel)}</div></div>
            <div class="spec"><div class="k">${t('spec.gearbox')}</div><div class="v">${esc(c.gearbox)}</div></div>
            <div class="spec"><div class="k">${t('spec.color')}</div><div class="v">${esc(c.color || '—')}</div></div>
            <div class="spec"><div class="k">${t('spec.city')}</div><div class="v">${esc(c.city)}</div></div>
          </div>
          <p style="line-height:1.55">${esc(c.description || t('modal.noDescription'))}</p>
          <div class="contact-box">
            <div class="k">${t('modal.dealer')}</div><div class="v">${esc(c.contactName || c.dealerName)}</div>
            <div class="k" style="margin-top:10px">${t('modal.phone')}</div><div class="v">${esc(c.contactPhone)}</div>
          </div>
        </div>
      </div>
    </div>`;
  }
  const r = modalData.data;
  return `
  <div class="overlay" data-action="close-modal">
    <div class="modal" onclick="event.stopPropagation()">
      <img style="height:320px;object-fit:cover;width:100%" src="${esc(r.photo)}" data-fallback="${esc(r.brand + ' ' + r.model)}">
      <div class="modal-body">
        <button class="modal-close" data-action="close-modal">×</button>
        <div class="modal-top">
          <div><span class="tag tag-private">${t('tag.privateListing')}</span><h2 style="margin:6px 0 2px">${esc(r.brand)} ${esc(r.model)}</h2></div>
          <div class="modal-price">${fmtPrice(r.price)}</div>
        </div>
        <div class="spec-grid">
          <div class="spec"><div class="k">${t('spec.year')}</div><div class="v">${r.year}</div></div>
          <div class="spec"><div class="k">${t('spec.km')}</div><div class="v">${fmtKm(r.km)}</div></div>
          <div class="spec"><div class="k">${t('spec.fuel')}</div><div class="v">${esc(r.fuel)}</div></div>
          <div class="spec"><div class="k">${t('spec.city')}</div><div class="v">${esc(r.city)}</div></div>
        </div>
        <p style="line-height:1.55">${esc(r.description || t('modal.noDescription'))}</p>
        <div class="contact-box">
          <div class="k">${t('modal.owner')}</div><div class="v">${esc(r.ownerName)}</div>
          <div class="k" style="margin-top:10px">${t('modal.phone')}</div><div class="v">${esc(r.phone)}</div>
        </div>
      </div>
    </div>
  </div>`;
}

function render() {
  let body = '';
  if (view === 'auth') body = renderAuth();
  else if (view === 'contact') body = renderContact();
  else if (view === 'home') body = renderHome();
  else if (view === 'profile' && session) body = renderProfile();
  else if (view === 'dealer-stock' && session && session.role === 'dealer') body = renderDealerStock();
  else if (view === 'dealer-requests' && session && session.role === 'dealer') body = renderDealerRequests();
  else if (view === 'user-sell' && session && session.role === 'user') body = renderUserSell();
  else if (view === 'user-listings' && session && session.role === 'user') body = renderUserListings();
  else if (view === 'admin' && session && session.role === 'admin') body = renderAdmin();
  else body = renderHome();

  document.getElementById('root').innerHTML = `
    ${renderHeader()}
    ${body}
    <footer class="footer">${t('footer.text', { brand: t('brand') })}</footer>
    ${renderModal()}
  `;

  const photoInput = document.getElementById('photoInput');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const f = photoInput.files[0];
      if (f) document.getElementById('photoPreview').src = URL.createObjectURL(f);
    });
  }
  document.querySelectorAll('input[type=file][data-preview]').forEach(inp => {
    inp.addEventListener('change', () => {
      const f = inp.files[0];
      const img = document.getElementById(inp.dataset.preview);
      if (f && img) img.src = URL.createObjectURL(f);
    });
  });
}

/* =========================================================
   Interactions
   ========================================================= */
// ---- Autocomplétion marques/modèles (liste chargée une fois, filtrée localement) ----
let acData = null, acLoadedAt = 0, acItems = [], acActive = -1, acShowHead = false;
const acNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

async function acLoad() {
  if (acData && Date.now() - acLoadedAt < 60000) return;
  try { acData = await api('/api/cars/suggestions'); acLoadedAt = Date.now(); } catch (e) { /* pas de suggestions, la recherche marche quand même */ }
}

function acCompute(q) {
  if (!acData) return [];
  const needle = acNorm(q);
  acShowHead = !needle;
  // Champ vide : TOUTES les marques en base, par ordre alphabétique (la liste défile).
  if (!needle) return acData.brands.slice().sort((x, y) => x.label.localeCompare(y.label));
  const starts = x => acNorm(x.label).startsWith(needle) ? 0 : 1;
  const b = acData.brands.filter(x => acNorm(x.label).includes(needle)).sort((x, y) => starts(x) - starts(y) || y.count - x.count);
  const m = acData.models.filter(x => acNorm(x.label).includes(needle)).sort((x, y) => starts(x) - starts(y) || y.count - x.count);
  // Toutes les marques correspondantes, puis quelques modèles.
  return b.concat(m.slice(0, 8));
}

function acRender() {
  const input = document.getElementById('fq');
  const list = document.getElementById('acList');
  if (!input || !list) return;
  const head = acShowHead && acItems.length ? `<li class="ac-head" role="presentation">${t('home.suggestPopular')}</li>` : '';
  list.innerHTML = head + acItems.map((it, i) =>
    `<li role="option" id="ac-${i}" class="ac-item${i === acActive ? ' active' : ''}" aria-selected="${i === acActive}" data-label="${esc(it.label)}"><span>${esc(it.label)}</span><small>${it.count}</small></li>`).join('');
  list.hidden = !acItems.length;
  input.setAttribute('aria-expanded', String(!!acItems.length));
  if (acActive >= 0) input.setAttribute('aria-activedescendant', 'ac-' + acActive); else input.removeAttribute('aria-activedescendant');
}

function acClose() { acItems = []; acActive = -1; acRender(); }

async function acUpdate(value) {
  await acLoad();
  acItems = acCompute(value);
  acActive = -1;
  acRender();
}

// ---- Suggestion de marques à la saisie d'un véhicule (formulaire concessionnaire) ----
// Marques courantes en Algérie ; elles s'ajoutent à celles déjà publiées sur le site.
const COMMON_BRANDS = ['Peugeot', 'Renault', 'Citroën', 'Dacia', 'Volkswagen', 'Seat', 'Škoda', 'Hyundai', 'Kia', 'Toyota',
  'Nissan', 'Suzuki', 'Fiat', 'Opel', 'Ford', 'Chevrolet', 'Mercedes-Benz', 'BMW', 'Audi', 'Mazda', 'Mitsubishi', 'Honda',
  'Chery', 'Geely', 'MG', 'Great Wall', 'DFSK', 'JAC', 'BYD', 'Haval', 'Isuzu', 'Land Rover', 'Jeep', 'Volvo', 'Alfa Romeo',
  'Mini', 'Lexus', 'Porsche', 'Subaru', 'Tata', 'Iveco', 'Changan', 'Foton', 'Lada', 'Daewoo', 'SsangYong', 'Mahindra',
  'Baic', 'GAC', 'Jetour', 'Dongfeng', 'Zotye', 'Lifan', 'Ravon', 'Infiniti', 'Jaguar', 'Tesla', 'Smart', 'Cupra', 'DS'];
let brandAcItems = [], brandAcActive = -1, brandAcTyped = '';

function brandAcAll() {
  const map = new Map();
  [...COMMON_BRANDS, ...((acData && acData.brands) || []).map(b => b.label)].forEach(b => {
    const k = acNorm(b);
    if (k && !map.has(k)) map.set(k, b);
  });
  return [...map.values()];
}

// Met en forme une marque saisie : casse officielle si elle existe déjà, sinon majuscule à chaque mot.
function brandCanonical(typed) {
  const raw = String(typed || '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const hit = brandAcAll().find(b => acNorm(b) === acNorm(raw));
  if (hit) return hit;
  return raw === raw.toLowerCase() ? raw.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : raw;
}

function brandAcRender() {
  const input = document.querySelector('input[data-brand-ac]');
  const list = document.getElementById('brandAcList');
  if (!input || !list) return;
  list.innerHTML = brandAcItems.map((it, i) =>
    it.add
      ? `<li role="option" id="bac-${i}" class="ac-item bac-item bac-add${i === brandAcActive ? ' active' : ''}" aria-selected="${i === brandAcActive}" data-label="${esc(it.label)}" data-add="1"><span>➕ ${esc(t('brand.addOption').replace('{0}', it.label))}</span></li>`
      : `<li role="option" id="bac-${i}" class="ac-item bac-item${i === brandAcActive ? ' active' : ''}" aria-selected="${i === brandAcActive}" data-label="${esc(it.label)}"><span>${esc(it.label)}</span></li>`).join('');
  list.hidden = !brandAcItems.length;
  input.setAttribute('aria-expanded', String(!!brandAcItems.length));
}

async function brandAcUpdate(value) {
  await acLoad();
  const needle = acNorm(value);
  const all = brandAcAll();
  let items = [];
  if (needle) {
    const starts = b => (acNorm(b).startsWith(needle) ? 0 : 1);
    items = all.filter(b => acNorm(b).includes(needle)).sort((a, b) => starts(a) - starts(b) || a.localeCompare(b)).map(label => ({ label }));
    // Marque inconnue : on propose de l'ajouter à la main.
    if (needle.length >= 2 && !all.some(b => acNorm(b) === needle)) items.push({ label: brandCanonical(value), add: true });
  } else {
    items = all.sort((a, b) => a.localeCompare(b)).map(label => ({ label }));
  }
  brandAcItems = items;
  brandAcActive = -1;
  brandAcRender();
}

function brandAcClose() { brandAcItems = []; brandAcActive = -1; brandAcRender(); }

function brandAcPick(label, isNew) {
  const input = document.querySelector('input[data-brand-ac]');
  if (!input) return;
  input.value = label;
  const note = document.getElementById('brandNote');
  if (note) note.textContent = isNew ? t('brand.newNote').replace('{0}', label) : t('brand.hint');
  brandAcClose();
}

document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('input[data-brand-ac]')) brandAcUpdate(e.target.value); });
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('input[data-brand-ac]')) {
    const note = document.getElementById('brandNote');
    if (note) note.textContent = t('brand.hint');
    brandAcUpdate(e.target.value);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.matches && e.target.matches('input[data-brand-ac]')) e.target.value = brandCanonical(e.target.value);
});
document.addEventListener('keydown', (e) => {
  if (!(e.target.matches && e.target.matches('input[data-brand-ac]'))) return;
  const n = brandAcItems.length;
  if (e.key === 'ArrowDown' && n) { e.preventDefault(); brandAcActive = (brandAcActive + 1) % n; brandAcRender(); }
  else if (e.key === 'ArrowUp' && n) { e.preventDefault(); brandAcActive = (brandAcActive - 1 + n) % n; brandAcRender(); }
  else if (e.key === 'Enter' && brandAcActive >= 0) { e.preventDefault(); const it = brandAcItems[brandAcActive]; brandAcPick(it.label, !!it.add); }
  else if (e.key === 'Escape' || e.key === 'Tab') brandAcClose();
});

async function applyFilters() {
  filters.q = (document.getElementById('fq') || { value: '' }).value.trim();
  filters.wilaya = (document.getElementById('fwilaya') || { value: '' }).value;
  filters.fuel = (document.getElementById('ffuel') || { value: '' }).value;
  filters.maxPrice = (document.getElementById('fprice') || { value: '' }).value;
  await loadCars(); render();
}

async function acPick(label) {
  const input = document.getElementById('fq');
  if (input) input.value = label;
  acClose();
  await applyFilters();
}

document.addEventListener('focusin', (e) => { if (e.target.id === 'fq') acUpdate(e.target.value); });
document.addEventListener('input', (e) => { if (e.target.id === 'fq') acUpdate(e.target.value); });
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'fq') return;
  if (e.key === 'ArrowDown' && acItems.length) { e.preventDefault(); acActive = (acActive + 1) % acItems.length; acRender(); }
  else if (e.key === 'ArrowUp' && acItems.length) { e.preventDefault(); acActive = (acActive - 1 + acItems.length) % acItems.length; acRender(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (acActive >= 0) acPick(acItems[acActive].label); else { acClose(); applyFilters(); } }
  else if (e.key === 'Escape') acClose();
});
document.addEventListener('pointerdown', (e) => {
  const li = e.target.closest && e.target.closest('.ac-item');
  if (li && li.classList.contains('bac-item')) { e.preventDefault(); brandAcPick(li.dataset.label, li.dataset.add === '1'); }
  else if (li) { e.preventDefault(); acPick(li.dataset.label); }
  else if (!(e.target.closest && e.target.closest('.ac-wrap'))) { acClose(); brandAcClose(); }
});

document.addEventListener('click', async (e) => {
  const t2 = e.target.closest('[data-action]');
  if (!t2) return;
  const action = t2.dataset.action;

  if (action === 'go') { await goto(t2.dataset.view); }
  else if (action === 'set-lang') { changeLang(t2.dataset.lang); }
  else if (action === 'security-clear') {
    const scope = t2.dataset.scope;
    if (!confirm(t('security.confirm.' + scope))) return;
    try {
      await api('/api/admin/security?scope=' + encodeURIComponent(scope), { method: 'DELETE' });
      securityCache = await api('/api/admin/security');
    } catch (err) { alert(err.message); }
    render();
  }
  else if (action === 'analytics-days') { analyticsDays = Number(t2.dataset.days) || 30; try { await loadAnalytics(); } catch (err) { /* garde l'ancien affichage */ } render(); }
  else if (action === 'toggle-menu') { document.getElementById('navLinks').classList.toggle('open'); }
  else if (action === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    session = null; trafficCache = null; await goto('home');
  }
  else if (action === 'delete-my-account') {
    const pwd = (document.getElementById('delPwd') || {}).value || '';
    if (!pwd || !confirm(t('profile.deleteConfirm'))) return;
    try {
      await api('/api/auth/me', { method: 'DELETE', json: { password: pwd } });
      session = null; trafficCache = null; await goto('home');
    } catch (err) { formMsg.profile = err.message; render(); }
  }
  else if (action === 'auth-tab') { authTab = t2.dataset.tab; formMsg.login = ''; formMsg.register = ''; render(); }
  else if (action === 'apply-filters') { await applyFilters(); }
  else if (action === 'gallery-pick') {
    const main = document.getElementById('galleryMain');
    if (main) { main.dataset.fallbackApplied = ''; main.src = t2.dataset.src; }
    document.querySelectorAll('.gallery-thumb').forEach(b => b.classList.toggle('active', b === t2));
  }
  else if (action === 'open-car') {
    modalData = { type: 'car', data: carsCache.find(c => String(c.id) === t2.dataset.id) };
    render();
  }
  else if (action === 'open-request') {
    modalData = { type: 'request', data: requestsCache.find(r => String(r.id) === t2.dataset.id) };
    render();
  }
  else if (action === 'close-modal') {
    // Un clic à l'intérieur de la fiche (photos, texte) ne doit pas la fermer : seulement le fond ou la croix.
    if (t2.classList.contains('overlay') && e.target.closest('.modal')) return;
    modalData = null; render();
  }
  else if (action === 'edit-car') {
    editingCar = carsCache.find(c => String(c.id) === t2.dataset.id);
    render();
    document.querySelector('[data-form="dealer-car"]').scrollIntoView({ behavior: 'smooth' });
  }
  else if (action === 'cancel-edit-car') { editingCar = null; render(); }
  else if (action === 'delete-car') {
    if (confirm(t('confirm.deleteCar'))) {
      try { await api('/api/cars/' + t2.dataset.id, { method: 'DELETE' }); await loadDealerCars(); render(); }
      catch (err) { alert(err.message); }
    }
  }
  else if (action === 'edit-req') {
    editingReq = myRequestsCache.find(r => String(r.id) === t2.dataset.id);
    view = 'user-sell'; render();
  }
  else if (action === 'cancel-edit-req') { editingReq = null; render(); }
  else if (action === 'delete-req') {
    if (confirm(t('confirm.deleteReq'))) {
      try { await api('/api/requests/' + t2.dataset.id, { method: 'DELETE' }); await loadMyRequests(); render(); }
      catch (err) { alert(err.message); }
    }
  }
  else if (action === 'edit-account') {
    editingAccount = accountsCache.find(a => String(a.id) === t2.dataset.id);
    formMsg.account = '';
    render();
    document.querySelector('[data-form="edit-account"]').scrollIntoView({ behavior: 'smooth' });
  }
  else if (action === 'cancel-edit-account') { editingAccount = null; formMsg.account = ''; render(); }
  else if (action === 'delete-account') {
    const acc = accountsCache.find(a => String(a.id) === t2.dataset.id);
    const label = acc && acc.role === 'dealer' ? t('confirm.deleteAccountDealer') : t('confirm.deleteAccountUser');
    if (confirm(label)) {
      try { await api('/api/admin/accounts/' + t2.dataset.id, { method: 'DELETE' }); await loadAdmin(); render(); }
      catch (err) { alert(err.message); }
    }
  }
  else if (action === 'install-app') {
    if (window.DzairCarrossePWA) await window.DzairCarrossePWA.promptInstall();
  }
  else if (action === 'contact-reset') { contactSent = false; formMsg.contact = ''; render(); }
  else if (action === 'toggle-msg-read') {
    try {
      await api(`/api/messages/${t2.dataset.id}/read`, { method: 'PUT', json: { read: t2.dataset.read === '1' } });
      await loadAdmin(); render();
    } catch (err) { alert(err.message); }
  }
  else if (action === 'delete-message') {
    if (confirm(t('confirm.deleteMessage'))) {
      try { await api('/api/messages/' + t2.dataset.id, { method: 'DELETE' }); await loadAdmin(); render(); }
      catch (err) { alert(err.message); }
    }
  }
  else if (action === 'delete-photo') {
    if (confirm(t('confirm.deletePhoto'))) {
      try {
        await api(`/api/admin/${t2.dataset.type === 'car' ? 'cars' : 'requests'}/${t2.dataset.id}/photo${t2.dataset.type === 'car' ? '?slot=' + (t2.dataset.slot || 0) : ''}`, { method: 'DELETE' });
        await loadAdmin(); render();
      } catch (err) { alert(err.message); }
    }
  }
  else if (action === 'delete-listing') {
    if (confirm(t('confirm.deleteListingFull'))) {
      try {
        await api(`/api/admin/${t2.dataset.type === 'car' ? 'cars' : 'requests'}/${t2.dataset.id}`, { method: 'DELETE' });
        await loadAdmin(); render();
      } catch (err) { alert(err.message); }
    }
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;
  busy = true; render();

  try {
    if (type === 'login') {
      const fd = new FormData(form);
      const r = await api('/api/auth/login', { method: 'POST', json: { username: fd.get('username').trim(), password: fd.get('password') } });
      session = r.user;
      await goto(session.role === 'admin' ? 'admin' : session.role === 'dealer' ? 'dealer-stock' : 'home');
      return;
    }
    if (type === 'register') {
      const fd = new FormData(form);
      const r = await api('/api/auth/register', { method: 'POST', json: {
        username: fd.get('username').trim(), password: fd.get('password'),
        name: fd.get('name').trim(), phone: fd.get('phone'), email: fd.get('email').trim(), city: fd.get('city')
      }});
      session = r.user;
      await goto('home');
      return;
    }
    if (type === 'contact') {
      const fd = new FormData(form);
      await api('/api/messages', { method: 'POST', json: {
        name: fd.get('name').trim(),
        email: (fd.get('email') || '').trim(),
        phone: (fd.get('phone') || '').trim(),
        subject: (fd.get('subject') || '').trim(),
        message: fd.get('message').trim()
      }});
      contactSent = true; formMsg.contact = '';
      return;
    }
    if (type === 'create-dealer') {
      const fd = new FormData(form);
      await api('/api/admin/dealers', { method: 'POST', json: {
        username: fd.get('username').trim(), password: fd.get('password'),
        name: fd.get('name').trim(), wilaya: fd.get('wilaya'), city: fd.get('city'), phone: fd.get('phone')
      }});
      formMsg.admin = 'OK:' + t('admin.dealerCreated');
      form.reset();
      await loadAdmin();
      return;
    }
    if (type === 'profile') {
      const fd = new FormData(form);
      const r = await api('/api/auth/me', { method: 'PUT', json: {
        name: fd.get('name').trim(), phone: fd.get('phone'), email: fd.get('email').trim(),
        city: fd.get('city'),
        ...(fd.has('wilaya') ? { wilaya: fd.get('wilaya') } : {}),
        currentPassword: fd.get('currentPassword') || undefined,
        newPassword: fd.get('newPassword') || undefined
      }});
      session = r.user;
      formMsg.profile = 'OK:' + t('admin.accountUpdated');
      form.reset();
      return;
    }
    if (type === 'edit-account') {
      const fd = new FormData(form);
      const id = form.dataset.id;
      await api('/api/admin/accounts/' + id, { method: 'PUT', json: {
        username: fd.get('username').trim(), name: fd.get('name').trim(),
        ...(fd.has('wilaya') ? { wilaya: fd.get('wilaya') } : {}),
        city: fd.get('city'), phone: fd.get('phone'),
        password: fd.get('password') || undefined
      }});
      editingAccount = null; formMsg.account = '';
      await loadAdmin();
      return;
    }
    if (type === 'dealer-car') {
      const fd = new FormData(form);
      const id = form.dataset.id;
      if (!fd.get('brand') || !fd.get('model') || !fd.get('year') || !fd.get('price') || !fd.get('km') || !fd.get('city')) {
        formMsg.dealerCar = t('validation.requiredFields'); return;
      }
      if (id) await api('/api/cars/' + id, { method: 'PUT', form: fd });
      else await api('/api/cars', { method: 'POST', form: fd });
      editingCar = null; formMsg.dealerCar = '';
      await loadDealerCars();
      return;
    }
    if (type === 'request') {
      const fd = new FormData(form);
      const id = form.dataset.id;
      if (!fd.get('brand') || !fd.get('model') || !fd.get('year') || !fd.get('price') || !fd.get('km') || !fd.get('city') || !fd.get('phone')) {
        formMsg.request = t('validation.requiredFields'); return;
      }
      if (id) await api('/api/requests/' + id, { method: 'PUT', form: fd });
      else await api('/api/requests', { method: 'POST', form: fd });
      editingReq = null; formMsg.request = '';
      await goto('user-listings');
      return;
    }
  } catch (err) {
    if (type === 'login') formMsg.login = err.message;
    else if (type === 'contact') formMsg.contact = err.message;
    else if (type === 'register') formMsg.register = err.message;
    else if (type === 'create-dealer') formMsg.admin = err.message;
    else if (type === 'edit-account') formMsg.account = err.message;
    else if (type === 'profile') formMsg.profile = err.message;
    else if (type === 'dealer-car') formMsg.dealerCar = err.message;
    else if (type === 'request') formMsg.request = err.message;
  } finally {
    // Toujours réactiver les boutons, que l'appel ait réussi, échoué,
    // ou qu'on soit sorti tôt via une validation (return). Avant ce correctif,
    // les branches de succès (login/register/request) ne repassaient jamais
    // busy à false, ce qui bloquait ensuite TOUS les formulaires du site.
    busy = false;
    render();
  }
});

/* =========================================================
   Démarrage — restaure la session via le cookie s'il y en a un
   ========================================================= */
async function init() {
  applyDocumentDir(getLang());
  try {
    const r = await api('/api/auth/me');
    session = r.user;
  } catch (e) { session = null; }
  pingPresence();
  if (session) pollTraffic();
  await goto(session ? (session.role === 'admin' ? 'admin' : session.role === 'dealer' ? 'dealer-stock' : 'home') : 'home');
}
init();
