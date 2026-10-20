const express = require('express');
const { isValidWilaya, wilayaName, dealerWilaya } = require('../lib/wilayas');
const bcrypt = require('bcryptjs');
const store = require('../lib/store');
const { requireAuth, publicUser } = require('../middleware/auth');
const { translate } = require('../lib/i18n-server');
const { deletePhotoFile } = require('../lib/upload');

const router = express.Router();

// Inscription — réservée aux particuliers. Les comptes concessionnaires
// sont créés uniquement par l'administrateur (voir routes/admin.js).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Identifiant : lettres/chiffres/tirets/points/underscore uniquement, 3 à 32
// caractères. Évite les caractères qui n'ont rien à faire dans un identifiant
// (espaces, guillemets, chevrons...) — une couche de défense en plus, même si
// l'identifiant n'est jamais utilisé tel quel dans une requête SQL ou du HTML
// non échappé ici.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
// Téléphone : chiffres, espaces, points, tirets, parenthèses et + (indicatif
// international), 8 à 20 caractères. Il n'y a plus de confirmation par SMS :
// le numéro n'est donc pas prouvé, mais on s'assure au moins qu'il a une
// forme plausible plutôt que d'accepter n'importe quel texte — c'est la seule
// façon pour un concessionnaire de recontacter le vendeur.
const PHONE_RE = /^[+]?[\d\s.()-]{8,20}$/;

router.post('/register', async (req, res) => {
  const db = store.load();
  const { username, password, name, phone, email, city } = req.body;

  if (!username || !password || !name || !phone) {
    return res.status(400).json({ error: translate(req.lang, 'auth.registerRequired') });
  }
  if (!USERNAME_RE.test(username.trim())) {
    return res.status(400).json({ error: translate(req.lang, 'auth.usernameFormat') });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: translate(req.lang, 'auth.passwordLength') });
  }
  if (name.trim().length > 100 || phone.trim().length > 30) {
    return res.status(400).json({ error: translate(req.lang, 'auth.nameOrPhoneTooLong') });
  }
  if (!PHONE_RE.test(phone.trim())) {
    return res.status(400).json({ error: translate(req.lang, 'auth.phoneInvalid') });
  }
  const trimmedEmail = (email || '').trim();
  if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
    return res.status(400).json({ error: translate(req.lang, 'auth.emailInvalid') });
  }
  if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: translate(req.lang, 'auth.usernameTaken') });
  }
  if (trimmedEmail && db.users.some(u => (u.email || '').toLowerCase() === trimmedEmail.toLowerCase())) {
    return res.status(409).json({ error: translate(req.lang, 'auth.emailTaken') });
  }

  const user = {
    id: store.nextId('users'),
    username: username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'user',
    name: name.trim(),
    phone: phone.trim(),
    email: trimmedEmail,
    city: (city || '').trim(),
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };
  db.users.push(user);
  store.persist();

  req.session.userId = user.id;
  req.session.role = user.role;
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const db = store.load();
  const { username, password } = req.body;
  const user = db.users.find(u => u.username.toLowerCase() === (username || '').toLowerCase());

  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: translate(req.lang, 'auth.loginFailed') });
  }

  user.lastActiveAt = Date.now();
  store.persist();

  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const db = store.load();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.json({ user: null });
  // Ouverture de l'app avec une session valide = activité (au plus 1 écriture/jour/compte).
  if (!user.lastActiveAt || Date.now() - user.lastActiveAt > 24 * 60 * 60 * 1000) {
    user.lastActiveAt = Date.now();
    store.persist();
  }
  res.json({ user: publicUser(user) });
});

// Chaque compte (y compris l'admin) peut mettre à jour son propre profil
// et changer son mot de passe — utile pour remplacer les identifiants par
// défaut définis via .env au premier démarrage.
router.put('/me', requireAuth(), async (req, res) => {
  const db = store.load();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: translate(req.lang, 'auth.accountNotFound') });

  const { name, phone, email, city, wilaya, currentPassword, newPassword } = req.body;

  if (newPassword) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(401).json({ error: translate(req.lang, 'auth.currentPasswordWrong') });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: translate(req.lang, 'auth.passwordLength') });
    }
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
  }
  if (email !== undefined) {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      return res.status(400).json({ error: translate(req.lang, 'auth.emailInvalid') });
    }
    if (trimmedEmail && db.users.some(u => u.id !== user.id && (u.email || '').toLowerCase() === trimmedEmail.toLowerCase())) {
      return res.status(409).json({ error: translate(req.lang, 'auth.emailTaken') });
    }
    user.email = trimmedEmail;
  }
  if (name && name.trim()) user.name = name.trim();
  if (phone !== undefined) {
    const trimmedPhone = phone.trim();
    // Le téléphone reste obligatoire : c'est le seul moyen de contact entre
    // un concessionnaire et un vendeur particulier. On empêche donc de le
    // vider depuis le profil, et on valide son format comme à l'inscription.
    if (!trimmedPhone || !PHONE_RE.test(trimmedPhone)) {
      return res.status(400).json({ error: translate(req.lang, 'auth.phoneInvalid') });
    }
    user.phone = trimmedPhone;
  }
  if (user.role === 'dealer' && wilaya !== undefined) {
    if (!isValidWilaya(wilaya)) {
      return res.status(400).json({ error: translate(req.lang, 'auth.wilayaRequired') });
    }
    user.wilaya = String(wilaya);
  }
  if (city !== undefined) {
    // La ville reste libre ; si elle est vidée, un concessionnaire retombe sur le nom de sa wilaya.
    user.city = String(city).trim() || (user.role === 'dealer' ? wilayaName(dealerWilaya(user)) : '');
  }

  store.persist();
  res.json({ user: publicUser(user) });
});

// Suppression de son propre compte (exigée par Google Play) : confirmation par
// mot de passe, puis suppression du compte, de ses annonces et de leurs photos.
router.delete('/me', requireAuth(), (req, res) => {
  const db = store.load();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(404).json({ error: translate(req.lang, 'auth.accountNotFound') });
  if (user.role === 'admin') {
    return res.status(403).json({ error: translate(req.lang, 'auth.adminAccountsNotDeleted') });
  }
  const { password } = req.body || {};
  if (!password || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: translate(req.lang, 'auth.currentPasswordWrong') });
  }

  db.users = db.users.filter(u => u.id !== user.id);
  if (user.role === 'dealer') {
    db.cars.filter(c => c.dealerId === user.id).forEach(c => deletePhotoFile(c.photo));
    db.cars = db.cars.filter(c => c.dealerId !== user.id);
  } else {
    db.requests.filter(r => r.userId === user.id).forEach(r => deletePhotoFile(r.photo));
    db.requests = db.requests.filter(r => r.userId !== user.id);
  }
  store.persist();
  req.session.destroy(() => res.json({ ok: true }));
});

module.exports = router;
