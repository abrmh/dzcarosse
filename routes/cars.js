const express = require('express');
const store = require('../lib/store');
const { requireAuth } = require('../middleware/auth');
const { upload, deletePhotoFile } = require('../lib/upload');
const { translate } = require('../lib/i18n-server');
const analytics = require('../lib/analytics');
const { dealerWilaya, isValidWilaya } = require('../lib/wilayas');

const router = express.Router();

// Insensible à la casse et aux accents ("citroen" trouve "Citroën").
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function withDealer(db, car, lang) {
  const dealer = db.users.find(u => u.id === car.dealerId);
  return {
    ...car,
    dealerName: dealer ? dealer.name : translate(lang, 'car.defaultDealerName'),
    dealerCity: dealer ? dealer.city : car.city,
    dealerWilaya: dealerWilaya(dealer)
  };
}

// Liste publique — accessible à tout le monde, y compris sans compte.
router.get('/', (req, res) => {
  const db = store.load();
  let list = db.cars.slice();

  const { fuel, maxPrice, wilaya } = req.query;
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
  if (q) {
    const needle = norm(q);
    list = list.filter(c => norm(`${c.brand} ${c.model}`).includes(needle));
  }
  if (fuel) list = list.filter(c => c.fuel === fuel);
  if (maxPrice) list = list.filter(c => c.price <= Number(maxPrice));
  // Recherche par wilaya : celle du concessionnaire qui vend la voiture.
  if (isValidWilaya(wilaya)) {
    const dealerWil = new Map(db.users.filter(u => u.role === 'dealer').map(u => [u.id, dealerWilaya(u)]));
    list = list.filter(c => dealerWil.get(c.dealerId) === String(wilaya));
  }

  // Statistiques admin : on compte les vraies recherches (texte saisi), pas les simples affichages.
  if (q && typeof q === 'string') analytics.recordSearch(q, list.length);

  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ cars: list.map(c => withDealer(db, c, req.lang)) });
});

// Wilayas où il existe au moins un concessionnaire dans l'application, avec le
// nombre de concessionnaires et d'annonces — sert à la liste de la page d'accueil.
router.get('/wilayas', (req, res) => {
  const db = store.load();
  const map = new Map();
  const dealerWil = new Map();
  for (const u of db.users) {
    if (u.role !== 'dealer') continue;
    const code = dealerWilaya(u);
    if (!code) continue;
    dealerWil.set(u.id, code);
    const e = map.get(code) || { code, dealers: 0, cars: 0 };
    e.dealers += 1;
    map.set(code, e);
  }
  for (const c of db.cars) {
    const e = map.get(dealerWil.get(c.dealerId));
    if (e) e.cars += 1;
  }
  res.json({ wilayas: [...map.values()].sort((a, b) => a.code.localeCompare(b.code)) });
});

// Autocomplétion : marques et modèles actuellement en vente chez les
// concessionnaires, avec le nombre d'annonces. Petite liste, filtrée côté client.
router.get('/suggestions', (req, res) => {
  const db = store.load();
  const brands = new Map();
  const models = new Map();
  const bump = (map, label) => {
    const key = norm(label);
    const e = map.get(key);
    if (e) e.count += 1; else map.set(key, { label, count: 1 });
  };
  for (const c of db.cars) {
    const b = String(c.brand || '').trim();
    if (!b) continue;
    bump(brands, b);
    const m = String(c.model || '').trim();
    if (m) bump(models, `${b} ${m}`);
  }
  const top = (map, limit) => [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ brands: top(brands, 1000), models: top(models, 2000) });
});

router.get('/:id', (req, res) => {
  const db = store.load();
  const car = db.cars.find(c => c.id === Number(req.params.id));
  if (!car) return res.status(404).json({ error: translate(req.lang, 'car.notFound') });
  res.json({ car: withDealer(db, car, req.lang) });
});

// Publication — réservée aux comptes concessionnaire connectés.
router.post('/', requireAuth('dealer'), upload.single('photo'), (req, res) => {
  const db = store.load();
  const dealer = db.users.find(u => u.id === req.session.userId);
  const { brand, model, year, km, price, fuel, gearbox, color, city, description, contactPhone, contactName } = req.body;

  if (!brand || !model || !year || !km || !price || !city) {
    return res.status(400).json({ error: translate(req.lang, 'car.requiredFields') });
  }

  const car = {
    id: store.nextId('cars'),
    dealerId: dealer.id,
    brand: brand.trim(),
    model: model.trim(),
    year: Number(year),
    km: Number(km),
    price: Number(price),
    fuel: fuel || 'Essence',
    gearbox: gearbox || 'Manuelle',
    color: (color || '').trim(),
    city: city.trim(),
    description: (description || '').trim(),
    photo: req.file ? `/uploads/${req.file.filename}` : '',
    contactName: (contactName || dealer.name).trim(),
    contactPhone: (contactPhone || dealer.phone).trim(),
    createdAt: Date.now()
  };
  db.cars.push(car);
  store.persist();
  res.status(201).json({ car: withDealer(db, car, req.lang) });
});

// Modification — le concessionnaire ne peut modifier que ses propres véhicules.
router.put('/:id', requireAuth('dealer'), upload.single('photo'), (req, res) => {
  const db = store.load();
  const car = db.cars.find(c => c.id === Number(req.params.id));
  if (!car) return res.status(404).json({ error: translate(req.lang, 'car.notFound') });
  if (car.dealerId !== req.session.userId) {
    return res.status(403).json({ error: translate(req.lang, 'car.otherDealer') });
  }

  const { brand, model, year, km, price, fuel, gearbox, color, city, description, contactPhone, contactName } = req.body;
  Object.assign(car, {
    brand: brand?.trim() ?? car.brand,
    model: model?.trim() ?? car.model,
    year: year ? Number(year) : car.year,
    km: km ? Number(km) : car.km,
    price: price ? Number(price) : car.price,
    fuel: fuel ?? car.fuel,
    gearbox: gearbox ?? car.gearbox,
    color: color?.trim() ?? car.color,
    city: city?.trim() ?? car.city,
    description: description?.trim() ?? car.description,
    contactName: contactName?.trim() ?? car.contactName,
    contactPhone: contactPhone?.trim() ?? car.contactPhone
  });
  if (req.file) {
    deletePhotoFile(car.photo);
    car.photo = `/uploads/${req.file.filename}`;
  }

  store.persist();
  res.json({ car: withDealer(db, car, req.lang) });
});

router.delete('/:id', requireAuth('dealer'), (req, res) => {
  const db = store.load();
  const car = db.cars.find(c => c.id === Number(req.params.id));
  if (!car) return res.status(404).json({ error: translate(req.lang, 'car.notFound') });
  if (car.dealerId !== req.session.userId) {
    return res.status(403).json({ error: translate(req.lang, 'car.otherDealer') });
  }
  deletePhotoFile(car.photo);
  db.cars = db.cars.filter(c => c.id !== car.id);
  store.persist();
  res.json({ ok: true });
});

module.exports = router;
