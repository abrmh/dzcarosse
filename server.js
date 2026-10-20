require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { sanitizeInput } = require('./middleware/sanitize');
const { translate, detectLangMiddleware } = require('./lib/i18n-server');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------
// 0) Garde-fous au démarrage — on refuse de démarrer en production avec
//    des secrets par défaut/absents plutôt que de tourner silencieusement
//    avec une porte grande ouverte.
// ---------------------------------------------------------------------
function assertProductionSafety() {
  const problems = [];
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-this-to-a-long-random-string') {
    problems.push('SESSION_SECRET doit être défini dans .env avec une valeur longue et aléatoire (ex: `openssl rand -hex 32`).');
  }
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'change-this-admin-password') {
    problems.push('ADMIN_PASSWORD doit être défini dans .env avec un mot de passe fort avant la mise en ligne.');
  }
  if (problems.length) {
    console.error('\n❌ Configuration non sécurisée pour la production :\n - ' + problems.join('\n - ') + '\n');
    process.exit(1);
  }
}
if (isProd) assertProductionSafety();

// ---------------------------------------------------------------------
// 1) Derrière un reverse proxy / load balancer (nginx, Cloudflare, etc.),
//    indispensable pour que req.ip, les cookies "secure" et le rate
//    limiting utilisent la vraie IP du client (en-tête X-Forwarded-For)
//    plutôt que l'IP du proxy.
// ---------------------------------------------------------------------
app.set('trust proxy', 1);

// Journal des IP + tentatives suspectes (visible par l'admin uniquement).
app.use(require('./lib/security').middleware);

// Mode maintenance (MAINTENANCE_MODE=1) : page d'attente, API fermée.
app.use(require('./lib/maintenance').middleware);

// ---------------------------------------------------------------------
// 2) En-têtes de sécurité HTTP (anti-XSS, anti-clickjacking, anti-sniffing,
//    force HTTPS...). CSP volontairement stricte : pas de script inline
//    autorisé (le frontend n'en a plus besoin, voir public/js/app.js).
// ---------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com', 'https://placehold.co'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

// Compression gzip — réduit la bande passante et la latence perçue, utile
// pour tenir davantage de connexions simultanées avec les mêmes ressources.
app.use(compression());

// ---------------------------------------------------------------------
// 3) CORS — l'app est servie en same-origin (le backend sert aussi le
//    frontend statique), donc AUCUNE origine externe n'est autorisée par
//    défaut : c'est la configuration la plus sûre. Si un jour le frontend
//    est déployé séparément, définir CORS_ORIGIN (une ou plusieurs origines
//    séparées par des virgules) dans .env.
// ---------------------------------------------------------------------
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-Lang']
}));

// ---------------------------------------------------------------------
// 4) Corps de requête — taille limitée pour éviter qu'une requête énorme
//    ne consomme mémoire/CPU inutilement (une forme basique de protection
//    anti-DoS applicatif). Les uploads de photos passent par multer
//    (multipart), pas par ces parseurs JSON/urlencoded.
// ---------------------------------------------------------------------
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb' }));

// Neutralise la pollution de prototype (__proto__, constructor...) sur
// req.body / req.query / req.params, sur toutes les routes.
app.use(sanitizeInput);

// Langue de la réponse API (FR/EN/AR) — voir lib/i18n-server.js. Doit être
// posé avant les limiteurs de débit ci-dessous pour que leurs messages
// soient eux aussi traduits.
app.use(detectLangMiddleware);

// Empêche la pollution de paramètres HTTP (ex: ?maxPrice=100&maxPrice=0
// pour contourner un filtre) en ne gardant que la dernière valeur.
app.use(hpp());

// ---------------------------------------------------------------------
// 5) Limitation de débit — protège contre le brute-force sur les comptes
//    et atténue les abus/DDoS applicatifs de bas niveau. Une vraie
//    protection DDoS volumétrique doit rester assurée en amont (CDN/WAF
//    type Cloudflare, ou le reverse proxy) : Express ne peut pas absorber
//    un flot de trafic réseau massif à lui seul.
// ---------------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX || 300), // 300 requêtes / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: translate(req.lang, 'generic.rateLimited') })
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20), // 20 tentatives / 15 min / IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // ne compte que les échecs (mauvais mot de passe, etc.)
  message: (req) => ({ error: translate(req.lang, 'generic.authRateLimited') })
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Formulaire de contact : seule route d'écriture ouverte au public (sans
// compte). Elle mérite donc sa propre limite, plus stricte que l'API
// générale, pour éviter qu'un script ne noie l'admin sous les messages.
// Ici on compte AUSSI les envois réussis (pas de skipSuccessfulRequests) :
// c'est précisément le succès répété qu'on veut brider.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX || 5), // 5 messages / heure / IP
  standardHeaders: true,
  legacyHeaders: false,
  message: (req) => ({ error: translate(req.lang, 'contact.rateLimited') })
});
// Uniquement sur l'envoi (POST) : la lecture par l'admin ne doit pas être bridée.
app.post('/api/messages', contactLimiter);

// ---------------------------------------------------------------------
// 6) Session — cookie httpOnly (déjà en place), + sameSite pour limiter le
//    CSRF, + secure en production (cookie envoyé uniquement en HTTPS).
//    Le store par défaut (MemoryStore) est correct pour un seul process ;
//    voir README pour le passage en cluster/multi-instance.
// ---------------------------------------------------------------------
app.use(session({
  name: 'tomobiledz.sid',
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  // Par défaut (SESSION_STORE non défini) : MemoryStore, parfait pour un
  // seul process. Si l'app tourne en cluster (plusieurs process Node, voir
  // README > Scalabilité), définir SESSION_STORE=file pour que toutes les
  // instances partagent les sessions via le disque (sinon un utilisateur
  // serait déconnecté aléatoirement selon le process qui traite sa requête).
  store: process.env.SESSION_STORE === 'file'
    ? new FileStore({ path: require('./lib/paths').SESSIONS_DIR, logFn: () => {} })
    : undefined,
  cookie: {
    httpOnly: true,
    secure: isProd, // nécessite HTTPS en production (souvent terminé par le reverse proxy)
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 jours
  }
}));

// Le journal d'IP ignore l'administrateur connecté (sinon, vider les tableaux
// les remplirait aussitôt avec sa propre IP). On le note ici, avant toute
// déconnexion éventuelle de la requête.
app.use((req, res, next) => {
  res.locals.isAdmin = !!(req.session && req.session.role === 'admin');
  next();
});

// Fichiers envoyés (photos des voitures) — jamais exécutés comme du code :
// multer ne stocke que des images valides (voir lib/upload.js), et on
// interdit explicitement l'exploration de dossier / les fichiers cachés.
app.use('/uploads', express.static(require('./lib/paths').UPLOAD_DIR, {
  dotfiles: 'deny',
  index: false,
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

// Digital Asset Links (Android TWA / Google Play) : /.well-known/assetlinks.json
// doit être servi tel quel, en HTTPS, sans redirection. On le monte AVANT le
// static de public/ qui refuse les fichiers/dossiers cachés (dotfiles: 'deny').
app.use('/.well-known', express.static(path.join(__dirname, 'well-known'), {
  dotfiles: 'allow',
  index: false,
  setHeaders: (res) => res.setHeader('Content-Type', 'application/json')
}));

// Frontend statique
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: ['index.html']
}));

// API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/cars', require('./routes/cars'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/messages', require('./routes/messages'));

// 404 pour toute route API inconnue
app.use('/api', (req, res) => res.status(404).json({ error: translate(req.lang, 'generic.routeNotFound') }));

// Erreurs (multer : fichier trop lourd, type refusé, etc., et erreurs
// générales) — jamais de stack trace renvoyée au client.
app.use((err, req, res, next) => {
  const lang = req.lang || 'fr';
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: translate(lang, 'upload.tooLarge') });
  }
  if (err && err.message) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: translate(lang, 'generic.serverError') });
});

const store = require('./lib/store');
const cleanup = require('./lib/cleanup');

let server;
store.init().then(() => {
  server = app.listen(PORT, () => {
    console.log(`DZair Carrosse backend démarré sur http://localhost:${PORT}${isProd ? ' (production)' : ''}`);
  });
  cleanup.start(); // suppression des comptes particuliers inactifs (2 mois)
  if (require('./lib/maintenance').enabled()) console.log('🛠️  MODE MAINTENANCE ACTIF : le site affiche la page d\'attente.');

  // Réglages pour tenir un grand nombre de connexions simultanées :
  // keep-alive généreux, timeouts anti-"slowloris", nombre d'en-têtes limité.
  server.keepAliveTimeout = 65 * 1000; // > timeout par défaut d'un LB typique (60s)
  server.headersTimeout = 66 * 1000;   // doit rester > keepAliveTimeout
  server.requestTimeout = 30 * 1000;   // coupe les requêtes anormalement lentes
  server.maxHeadersCount = 100;
}).catch(err => {
  console.error('❌ Démarrage impossible (base de données) :', err.message);
  process.exit(1);
});

// Arrêt propre : on laisse les requêtes en cours se terminer avant de
// quitter, au lieu de les couper brutalement (utile avec PM2/systemd).
function shutdown(signal) {
  console.log(`\n${signal} reçu, arrêt en cours...`);
  const done = () => Promise.resolve(store.persist()).then(() => store.flush()).finally(() => process.exit(0));
  if (server) server.close(done); else done();
  setTimeout(() => process.exit(1), 10 * 1000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
