const express = require('express');
const store = require('../lib/store');
const { requireAuth } = require('../middleware/auth');
const { upload, deletePhotoFile } = require('../lib/upload');
const { translate } = require('../lib/i18n-server');

const router = express.Router();

function withOwner(db, r, lang) {
  const owner = db.users.find(u => u.id === r.userId);
  return { ...r, ownerName: owner ? owner.name : translate(lang, 'request.defaultOwnerName') };
}

// Réservé aux concessionnaires et à l'admin : jamais exposé publiquement,
// jamais visible par les autres particuliers.
router.get('/', requireAuth('dealer', 'admin'), (req, res) => {
  const db = store.load();
  const list = db.requests.slice().sort((a, b) => b.createdAt - a.createdAt);
  res.json({ requests: list.map(r => withOwner(db, r, req.lang)) });
});

router.get('/mine', requireAuth('user'), (req, res) => {
  const db = store.load();
  const list = db.requests
    .filter(r => r.userId === req.session.userId)
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ requests: list });
});

router.get('/:id', requireAuth('dealer', 'admin'), (req, res) => {
  const db = store.load();
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: translate(req.lang, 'request.notFound') });
  res.json({ request: withOwner(db, r, req.lang) });
});

// Dépôt d'une annonce par un particulier — avec sa vraie photo et ses infos.
router.post('/', requireAuth('user'), upload.single('photo'), (req, res) => {
  const db = store.load();
  const { brand, model, year, km, price, fuel, city, phone, description } = req.body;

  if (!brand || !model || !year || !km || !price || !city || !phone) {
    return res.status(400).json({ error: translate(req.lang, 'request.requiredFields') });
  }

  const r = {
    id: store.nextId('requests'),
    userId: req.session.userId,
    brand: brand.trim(),
    model: model.trim(),
    year: Number(year),
    km: Number(km),
    price: Number(price),
    fuel: fuel || 'Essence',
    city: city.trim(),
    phone: phone.trim(),
    description: (description || '').trim(),
    photo: req.file ? `/uploads/${req.file.filename}` : '',
    createdAt: Date.now()
  };
  db.requests.push(r);
  store.persist();
  res.status(201).json({ request: r });
});

router.put('/:id', requireAuth('user'), upload.single('photo'), (req, res) => {
  const db = store.load();
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: translate(req.lang, 'request.notFound') });
  if (r.userId !== req.session.userId) {
    return res.status(403).json({ error: translate(req.lang, 'request.otherUser') });
  }

  const { brand, model, year, km, price, fuel, city, phone, description } = req.body;
  Object.assign(r, {
    brand: brand?.trim() ?? r.brand,
    model: model?.trim() ?? r.model,
    year: year ? Number(year) : r.year,
    km: km ? Number(km) : r.km,
    price: price ? Number(price) : r.price,
    fuel: fuel ?? r.fuel,
    city: city?.trim() ?? r.city,
    phone: phone?.trim() ?? r.phone,
    description: description?.trim() ?? r.description
  });
  if (req.file) {
    deletePhotoFile(r.photo);
    r.photo = `/uploads/${req.file.filename}`;
  }

  store.persist();
  res.json({ request: r });
});

router.delete('/:id', requireAuth('user'), (req, res) => {
  const db = store.load();
  const r = db.requests.find(x => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: translate(req.lang, 'request.notFound') });
  if (r.userId !== req.session.userId) {
    return res.status(403).json({ error: translate(req.lang, 'request.otherUser') });
  }
  deletePhotoFile(r.photo);
  db.requests = db.requests.filter(x => x.id !== r.id);
  store.persist();
  res.json({ ok: true });
});

module.exports = router;
