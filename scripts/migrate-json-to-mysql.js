// Importe data/db.json (ancienne base fichier) dans MySQL.
// Usage : arrêter l'app, renseigner DB_* dans .env, puis :
//   npm run migrate:mysql            (ou : node scripts/migrate-json-to-mysql.js chemin/vers/db.json)
// Refuse d'écraser une base MySQL qui contient déjà des comptes (ajouter --force pour fusionner/écraser par id).
require('dotenv').config();
const fs = require('fs');
const path = require('path');

(async () => {
  if (!process.env.DB_NAME) { console.error('DB_NAME (et DB_USER, DB_PASSWORD, DB_HOST) doivent être définis dans .env'); process.exit(1); }
  const file = process.argv.find(a => a.endsWith('.json')) || path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(file)) { console.error('Fichier introuvable :', file); process.exit(1); }
  const src = JSON.parse(fs.readFileSync(file, 'utf-8'));

  const store = require('../lib/store-mysql');
  await store.init({ skipSeed: true });
  const db = store.load();
  if (db.users.length && !process.argv.includes('--force')) {
    console.error(`La base MySQL contient déjà ${db.users.length} compte(s). Rien n'a été importé (utilisez --force pour forcer).`);
    await store.close(); process.exit(1);
  }

  for (const name of ['users', 'cars', 'requests', 'messages']) db[name] = src[name] || [];
  db.seq = { users: 0, cars: 0, requests: 0, messages: 0, ...(src.seq || {}) };
  for (const name of ['users', 'cars', 'requests', 'messages']) {
    const max = db[name].reduce((m, o) => Math.max(m, o.id || 0), 0);
    if (db.seq[name] < max) db.seq[name] = max;
  }
  db.analytics = src.analytics || { daily: {}, terms: {} };
  db.security = src.security || { visitors: {}, events: [] };
  store.touchMeta('analytics'); store.touchMeta('security');
  await store.persist();
  await store.close();
  console.log(`✅ Import terminé : ${db.users.length} comptes, ${db.cars.length} voitures, ${db.requests.length} demandes, ${db.messages.length} messages.`);
})().catch(err => { console.error('Échec de la migration :', err); process.exit(1); });
