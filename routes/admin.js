const express = require('express');
const { isValidWilaya, wilayaName, dealerWilaya } = require('../lib/wilayas');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const store = require('../lib/store');
const { requireAuth, publicUser } = require('../middleware/auth');
const { UPLOAD_DIR, deletePhotoFile, deleteCarPhotos, carPhotoSlots, setCarPhotos } = require('../lib/upload');
const { translate } = require('../lib/i18n-server');

const router = express.Router();
router.use(requireAuth('admin'));

// Voir routes/auth.js pour le détail de ce choix de format d'identifiant.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

function accountWithCounts(db, u) {
  const extra = {};
  if (u.role === 'dealer') extra.listingsCount = db.cars.filter(c => c.dealerId === u.id).length;
  if (u.role === 'user') extra.listingsCount = db.requests.filter(r => r.userId === u.id).length;
  return { ...publicUser(u), ...extra };
}

// Seul l'admin peut créer un compte concessionnaire — c'est ce compte
// qui donne au concessionnaire le droit de publier des voitures à vendre.
router.post('/dealers', async (req, res) => {
  const db = store.load();
  const { username, password, name, wilaya, city, phone } = req.body;

  if (!username || !password || !name) {
    return res.status(400).json({ error: translate(req.lang, 'auth.dealerRequired') });
  }
  if (!USERNAME_RE.test(username.trim())) {
    return res.status(400).json({ error: translate(req.lang, 'auth.usernameFormat') });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: translate(req.lang, 'auth.passwordLength') });
  }
  if (!isValidWilaya(wilaya)) {
    return res.status(400).json({ error: translate(req.lang, 'auth.wilayaRequired') });
  }
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: translate(req.lang, 'auth.usernameTaken') });
  }

  const dealer = {
    id: store.nextId('users'),
    username: username.trim(),
    passwordHash: await bcrypt.hash(password, 10),
    role: 'dealer',
    name: name.trim(),
    wilaya: String(wilaya),
    city: String(city || '').trim() || wilayaName(wilaya),
    phone: (phone || '').trim(),
    createdAt: Date.now()
  };
  db.users.push(dealer);
  store.persist();
  res.status(201).json({ user: publicUser(dealer) });
});

// Vue unifiée de tous les comptes gérables par l'admin (concessionnaires
// et particuliers — les comptes admin ne sont pas listés/modifiables ici).
router.get('/accounts', (req, res) => {
  const db = store.load();
  const { role } = req.query;
  let list = db.users.filter(u => u.role === 'dealer' || u.role === 'user');
  if (role === 'dealer' || role === 'user') list = list.filter(u => u.role === role);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ accounts: list.map(u => accountWithCounts(db, u)) });
});

// Modifier un compte concessionnaire ou particulier : identifiant, nom,
// ville, téléphone, et réinitialisation du mot de passe si fourni.
router.put('/accounts/:id', (req, res) => {
  const db = store.load();
  const id = Number(req.params.id);
  const acc = db.users.find(u => u.id === id);
  if (!acc) return res.status(404).json({ error: translate(req.lang, 'auth.accountNotFound') });
  if (acc.role === 'admin') {
    return res.status(403).json({ error: translate(req.lang, 'auth.adminAccountsNotManaged') });
  }

  const { username, name, phone, city, wilaya, password } = req.body;

  if (username && username.trim().toLowerCase() !== acc.username.toLowerCase()) {
    if (!USERNAME_RE.test(username.trim())) {
      return res.status(400).json({ error: translate(req.lang, 'auth.usernameFormat') });
    }
    if (db.users.some(u => u.id !== id && u.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(409).json({ error: translate(req.lang, 'auth.usernameTakenOther') });
    }
    acc.username = username.trim();
  }
  if (name && name.trim()) acc.name = name.trim();
  if (phone !== undefined) acc.phone = phone.trim();
  if (acc.role === 'dealer' && wilaya !== undefined) {
    if (!isValidWilaya(wilaya)) {
      return res.status(400).json({ error: translate(req.lang, 'auth.wilayaRequired') });
    }
    acc.wilaya = String(wilaya);
  }
  if (city !== undefined) {
    // La ville reste libre ; si elle est vidée, on retombe sur le nom de la wilaya.
    acc.city = String(city).trim() || (acc.role === 'dealer' ? wilayaName(dealerWilaya(acc)) : '');
  }
  if (password) {
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: translate(req.lang, 'auth.passwordLength') });
    acc.passwordHash = bcrypt.hashSync(password, 10);
  }

  store.persist();
  res.json({ user: accountWithCounts(db, acc) });
});

// Supprimer un compte : ses annonces (voitures ou demandes de vente) sont
// supprimées avec lui pour ne rien laisser d'orphelin.
router.delete('/accounts/:id', (req, res) => {
  const db = store.load();
  const id = Number(req.params.id);
  const acc = db.users.find(u => u.id === id);
  if (!acc) return res.status(404).json({ error: translate(req.lang, 'auth.accountNotFound') });
  if (acc.role === 'admin') {
    return res.status(403).json({ error: translate(req.lang, 'auth.adminAccountsNotDeleted') });
  }

  db.users = db.users.filter(u => u.id !== id);
  if (acc.role === 'dealer') {
    db.cars.filter(c => c.dealerId === id).forEach(c => deleteCarPhotos(c));
    db.cars = db.cars.filter(c => c.dealerId !== id);
  }
  if (acc.role === 'user') {
    db.requests.filter(r => r.userId === id).forEach(r => deletePhotoFile(r.photo));
    db.requests = db.requests.filter(r => r.userId !== id);
  }

  store.persist();
  res.json({ ok: true });
});

// Journal de sécurité : IP des visiteurs + tentatives suspectes.
router.get('/security', (req, res) => {
  res.json(require('../lib/security').buildReport(req.ip));
});

// Vider les tableaux du journal de sécurité (?scope=incidents|suspicious|visitors|all).
router.delete('/security', (req, res) => {
  if (!require('../lib/security').clear(String(req.query.scope || ''))) {
    return res.status(400).json({ error: 'scope invalide' });
  }
  res.json({ ok: true });
});

// Tableau de bord : recherches par marque (%), inscriptions, stock...
// Compteur en direct (léger, interrogé toutes les 30 s par l'écran admin).
router.get('/traffic', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...require('../lib/presence').snapshot(), ...require('../lib/analytics').todayTraffic() });
});

router.get('/analytics', (req, res) => {
  const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  res.json(require('../lib/analytics').buildReport(days));
});

router.get('/stats', (req, res) => {
  const db = store.load();
  res.json({
    dealers: db.users.filter(u => u.role === 'dealer').length,
    users: db.users.filter(u => u.role === 'user').length,
    cars: db.cars.length,
    requests: db.requests.length
  });
});

// Vue "stockage" : taille du dossier uploads/ + détail de chaque photo
// (véhicule ou annonce particulier) pour que l'admin repère et supprime
// les photos qui prennent le plus de place.
router.get('/storage', (req, res) => {
  const db = store.load();

  function fileSize(photoUrl) {
    if (!photoUrl || !photoUrl.startsWith('/uploads/')) return 0;
    try { return fs.statSync(path.join(UPLOAD_DIR, path.basename(photoUrl))).size; }
    catch (e) { return 0; }
  }

  const dealerName = (id) => (db.users.find(u => u.id === id) || {}).name || translate(req.lang, 'car.defaultDealerName');
  const ownerName = (id) => (db.users.find(u => u.id === id) || {}).name || translate(req.lang, 'request.defaultOwnerName');

  // Une ligne par photo (jusqu'à 3 par véhicule) ; `slot` identifie l'emplacement.
  const carPhotos = [];
  for (const c of db.cars) {
    carPhotoSlots(c).forEach((url, slot) => {
      if (!url || !url.startsWith('/uploads/')) return;
      carPhotos.push({ type: 'car', id: c.id, slot, label: `${c.brand} ${c.model} — ${dealerName(c.dealerId)} (${slot + 1}/3)`, photo: url, sizeBytes: fileSize(url) });
    });
  }

  const requestPhotos = db.requests
    .filter(r => r.photo && r.photo.startsWith('/uploads/'))
    .map(r => ({ type: 'request', id: r.id, label: `${r.brand} ${r.model} — ${ownerName(r.userId)}`, photo: r.photo, sizeBytes: fileSize(r.photo) }));

  const photos = carPhotos.concat(requestPhotos).sort((a, b) => b.sizeBytes - a.sizeBytes);

  let filesOnDisk = 0, bytesOnDisk = 0;
  try {
    filesOnDisk = fs.readdirSync(UPLOAD_DIR).filter(f => {
      if (f.startsWith('.')) return false; // ignore .gitkeep et fichiers cachés
      try { bytesOnDisk += fs.statSync(path.join(UPLOAD_DIR, f)).size; return true; }
      catch (e) { return false; }
    }).length;
  } catch (e) { /* dossier pas encore créé */ }

  res.json({
    filesOnDisk,
    bytesOnDisk,
    orphanFiles: Math.max(0, filesOnDisk - photos.length), // fichiers sans annonce associée
    photos
  });
});

// Supprimer uniquement la photo d'une annonce (l'annonce reste en ligne,
// sans image) — utile pour libérer de l'espace sans tout supprimer.
router.delete('/cars/:id/photo', (req, res) => {
  const db = store.load();
  const car = db.cars.find(c => c.id === Number(req.params.id));
  if (!car) return res.status(404).json({ error: translate(req.lang, 'car.notFound') });
  const slot = [0, 1, 2].includes(Number(req.query.slot)) ? Number(req.query.slot) : 0;
  const slots = carPhotoSlots(car);
  deletePhotoFile(slots[slot]);
  slots[slot] = '';
  setCarPhotos(car, slots);
  store.persist();
  res.json({ ok: true });
});

router.delete('/requests/:id/photo', (req, res) => {
  const db = store.load();
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: translate(req.lang, 'request.notFound') });
  deletePhotoFile(r.photo);
  r.photo = '';
  store.persist();
  res.json({ ok: true });
});

// Supprimer une annonce entière (véhicule ou demande de particulier)
// sans avoir à supprimer tout le compte de son propriétaire.
router.delete('/cars/:id', (req, res) => {
  const db = store.load();
  const car = db.cars.find(c => c.id === Number(req.params.id));
  if (!car) return res.status(404).json({ error: translate(req.lang, 'car.notFound') });
  deleteCarPhotos(car);
  db.cars = db.cars.filter(c => c.id !== car.id);
  store.persist();
  res.json({ ok: true });
});

router.delete('/requests/:id', (req, res) => {
  const db = store.load();
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: translate(req.lang, 'request.notFound') });
  deletePhotoFile(r.photo);
  db.requests = db.requests.filter(x => x.id !== r.id);
  store.persist();
  res.json({ ok: true });
});

module.exports = router;
