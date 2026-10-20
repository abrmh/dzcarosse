const express = require('express');
const store = require('../lib/store');
const { requireAuth } = require('../middleware/auth');
const { translate } = require('../lib/i18n-server');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s.()-]{8,20}$/;

// Limites de longueur : empêchent qu'un formulaire public serve à remplir
// le disque avec un message de plusieurs mégaoctets.
const MAX = { name: 100, email: 150, phone: 30, subject: 150, message: 2000 };

// --- Dépôt d'un message : PUBLIC (aucun compte nécessaire) -------------
// C'est la seule route d'écriture ouverte à tout le monde. Elle est donc
// limitée en débit dans server.js (contactLimiter) et strictement validée
// ici. Le contenu n'est jamais interprété : il est stocké tel quel et
// échappé à l'affichage côté admin (esc() dans public/js/app.js).
router.post('/', (req, res) => {
  const db = store.load();
  const { name, email, phone, subject, message } = req.body;

  if (!name || !message) {
    return res.status(400).json({ error: translate(req.lang, 'contact.requiredFields') });
  }
  // Au moins un moyen de recontacter la personne, sinon le message est inutile.
  if (!email && !phone) {
    return res.status(400).json({ error: translate(req.lang, 'contact.contactRequired') });
  }

  const trimmed = {
    name: String(name).trim(),
    email: String(email || '').trim(),
    phone: String(phone || '').trim(),
    subject: String(subject || '').trim(),
    message: String(message).trim()
  };

  if (trimmed.name.length > MAX.name || trimmed.email.length > MAX.email
    || trimmed.phone.length > MAX.phone || trimmed.subject.length > MAX.subject
    || trimmed.message.length > MAX.message) {
    return res.status(400).json({ error: translate(req.lang, 'contact.tooLong') });
  }
  if (trimmed.email && !EMAIL_RE.test(trimmed.email)) {
    return res.status(400).json({ error: translate(req.lang, 'auth.emailInvalid') });
  }
  if (trimmed.phone && !PHONE_RE.test(trimmed.phone)) {
    return res.status(400).json({ error: translate(req.lang, 'auth.phoneInvalid') });
  }

  db.seq.messages += 1;
  db.messages.push({
    id: db.seq.messages,
    ...trimmed,
    // Si la personne est connectée, on note son compte : ça évite à l'admin
    // de deviner qui a écrit, sans empêcher les visiteurs anonymes d'écrire.
    userId: req.session.userId || null,
    read: false,
    createdAt: Date.now()
  });
  store.persist();

  // On ne renvoie pas le message créé : le visiteur n'a pas besoin de son
  // id, et rien ne doit laisser croire qu'il peut le relire ensuite.
  res.status(201).json({ ok: true });
});

// --- Lecture / gestion : ADMIN uniquement ------------------------------
router.get('/', requireAuth('admin'), (req, res) => {
  const db = store.load();
  // On joint l'identifiant du compte quand le message vient d'un utilisateur
  // connecté, pour que l'admin voie de qui il s'agit sans chercher.
  const list = db.messages
    .map(m => {
      if (!m.userId) return m;
      const u = db.users.find(x => x.id === m.userId);
      return { ...m, username: u ? u.username : null };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({
    messages: list,
    unreadCount: list.filter(m => !m.read).length
  });
});

// Marquer lu / non lu (permet de suivre ce qui a été traité).
router.put('/:id/read', requireAuth('admin'), (req, res) => {
  const db = store.load();
  const msg = db.messages.find(m => m.id === Number(req.params.id));
  if (!msg) return res.status(404).json({ error: translate(req.lang, 'contact.notFound') });
  msg.read = req.body.read !== false;
  store.persist();
  res.json({ message: msg });
});

router.delete('/:id', requireAuth('admin'), (req, res) => {
  const db = store.load();
  const msg = db.messages.find(m => m.id === Number(req.params.id));
  if (!msg) return res.status(404).json({ error: translate(req.lang, 'contact.notFound') });
  db.messages = db.messages.filter(m => m.id !== msg.id);
  store.persist();
  res.json({ ok: true });
});

module.exports = router;
