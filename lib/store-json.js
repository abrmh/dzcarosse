// Couche de persistance très simple, basée sur un fichier JSON.
// Suffisante pour une démo / petit volume ; pour la production,
// remplacer par une vraie base (Postgres, MySQL, SQLite...).
const fs = require('fs');
const path = require('path');
const { buildSeed, syncAdminFromEnv } = require('./seed');

const { DATA_DIR } = require('./paths');
const DB_PATH = path.join(DATA_DIR, 'db.json');

function seedData() {
  const db = buildSeed();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  return db;
}

let db;

function load() {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    db = seedData();
  } else {
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!db.messages) db.messages = [];
    if (!db.seq) db.seq = { users: 0, cars: 0, requests: 0 };
    if (db.seq.messages === undefined) db.seq.messages = 0;
    if (syncAdminFromEnv(db)) fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  }
  return db;
}

// Écriture asynchrone et mise en file d'attente : on ne bloque plus la
// boucle d'événements Node (donc toutes les autres requêtes en cours) le
// temps d'écrire le fichier sur disque à chaque création/modification.
// - JSON.stringify reste synchrone (rapide, en mémoire) pour figer l'état
//   exact au moment de l'appel, avant que d'autres mutations n'arrivent.
// - Les écritures sont chaînées (writeQueue) pour garder l'ordre et éviter
//   que deux écritures concurrentes ne se marchent dessus.
// - Écriture dans un fichier temporaire puis renommage (atomique côté OS)
//   pour ne jamais laisser data/db.json à moitié écrit si le process
//   plante pendant l'écriture.
let writeQueue = Promise.resolve();

function persist() {
  const snapshot = JSON.stringify(db, null, 2);
  writeQueue = writeQueue
    .then(() => fs.promises.mkdir(DATA_DIR, { recursive: true }))
    .then(() => {
      const tmpPath = `${DB_PATH}.tmp`;
      return fs.promises.writeFile(tmpPath, snapshot).then(() => fs.promises.rename(tmpPath, DB_PATH));
    })
    .catch(err => console.error('Erreur d\'écriture de data/db.json :', err));
  return writeQueue;
}

function nextId(key) {
  db.seq[key] += 1;
  return db.seq[key];
}

// API commune avec store-mysql.js
async function init() { load(); }
function touchMeta() { /* db.json est réécrit en entier à chaque persist() */ }
function flush() { return writeQueue; }

module.exports = { init, load, persist, flush, touchMeta, nextId, get DATA_DIR() { return DATA_DIR; } };
