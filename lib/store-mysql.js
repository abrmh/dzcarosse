// Stockage MySQL / MariaDB.
//
// Principe : toutes les données sont chargées en mémoire au démarrage (les
// routes continuent d'utiliser store.load() / store.persist() sans changement),
// et chaque persist() n'écrit dans MySQL QUE les lignes ajoutées, modifiées ou
// supprimées (au lieu de réécrire tout un fichier JSON à chaque requête).
//
// Contrainte : une seule instance Node doit tourner à la fois (le cache est en
// mémoire). Un verrou MySQL (GET_LOCK) l'impose : pas de mode cluster.
const mysql = require('mysql2/promise');
const { buildSeed, syncAdminFromEnv } = require('./seed');

const { DATA_DIR } = require('./paths');

// collection -> table + colonnes indexées (le reste vit dans `data`, en JSON)
const COLLECTIONS = {
  users:    { table: 'users',    cols: { username: o => String(o.username || '').slice(0, 64), role: o => String(o.role || '').slice(0, 16), last_active: o => o.lastActiveAt || o.createdAt || 0 } },
  cars:     { table: 'cars',     cols: { dealer_id: o => o.dealerId || 0 } },
  requests: { table: 'requests', cols: { user_id: o => o.userId || 0 } },
  messages: { table: 'messages', cols: {} }
};

const COL_TYPES = { username: 'VARCHAR(64) NOT NULL', role: 'VARCHAR(16) NOT NULL', last_active: 'BIGINT NOT NULL', dealer_id: 'BIGINT NOT NULL', user_id: 'BIGINT NOT NULL' };
const COL_INDEX = { username: true, role: false, last_active: true, dealer_id: true, user_id: true };

let pool;
let lockConn;
let db;
let metaSnapshot = '';
// Documents JSON annexes stockés dans la table meta (statistiques, journal de sécurité).
const META_DOCS = { analytics: () => ({ daily: {}, terms: {} }), security: () => ({ visitors: {}, events: [] }) };
const metaSnaps = {};
const dirtyMeta = new Set();
function touchMeta(name) { if (META_DOCS[name]) dirtyMeta.add(name); }
const snapshots = {};            // collection -> Map(id -> JSON string déjà en base)
let writeQueue = Promise.resolve();

function cfg() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
  };
}

async function createSchema() {
  for (const { table, cols } of Object.values(COLLECTIONS)) {
    const colDefs = Object.keys(cols).map(c => `${c} ${COL_TYPES[c]}`).join(', ');
    const idx = Object.keys(cols).filter(c => COL_INDEX[c]).map(c => `, INDEX idx_${table}_${c} (${c})`).join('');
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${table} (id BIGINT NOT NULL PRIMARY KEY${colDefs ? ', ' + colDefs : ''}, data LONGTEXT NOT NULL${idx}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  }
  await pool.query('CREATE TABLE IF NOT EXISTS meta (k VARCHAR(32) NOT NULL PRIMARY KEY, v TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

// Un seul process à la fois : sinon deux caches mémoire diverge et s'écrasent.
async function acquireLock() {
  lockConn = await pool.getConnection();
  const [rows] = await lockConn.query("SELECT GET_LOCK(?, 30) AS ok", [`tomobiledz:${process.env.DB_NAME}`]);
  if (!rows[0].ok) {
    throw new Error('Une autre instance de DZair Carrosse utilise déjà cette base (mode cluster non supporté avec MySQL).');
  }
  // Garde la connexion (et donc le verrou) vivante.
  setInterval(() => {
    lockConn.query('SELECT 1').catch(err => {
      console.error('Connexion de verrouillage MySQL perdue — arrêt pour redémarrage propre :', err.message);
      process.exit(1);
    });
  }, 60 * 1000).unref();
}

async function loadAll() {
  const out = { seq: { users: 0, cars: 0, requests: 0, messages: 0 }, users: [], cars: [], requests: [], messages: [] };
  for (const [name, { table }] of Object.entries(COLLECTIONS)) {
    const [rows] = await pool.query(`SELECT id, data FROM ${table} ORDER BY id`);
    out[name] = rows.map(r => JSON.parse(r.data));
  }
  const [metaRows] = await pool.query('SELECT k, v FROM meta');
  for (const r of metaRows) {
    if (r.k === 'seq') Object.assign(out.seq, JSON.parse(r.v));
    else if (META_DOCS[r.k]) out[r.k] = JSON.parse(r.v);
  }
  for (const name of Object.keys(META_DOCS)) if (!out[name]) out[name] = META_DOCS[name]();
  // Sécurité : la séquence ne doit jamais être inférieure au plus grand id.
  for (const name of Object.keys(COLLECTIONS)) {
    const max = out[name].reduce((m, o) => Math.max(m, o.id || 0), 0);
    if ((out.seq[name] || 0) < max) out.seq[name] = max;
  }
  return out;
}

function takeSnapshots() {
  for (const name of Object.keys(COLLECTIONS)) {
    snapshots[name] = new Map(db[name].map(o => [o.id, JSON.stringify(o)]));
  }
  metaSnapshot = JSON.stringify(db.seq);
  for (const name of Object.keys(META_DOCS)) metaSnaps[name] = JSON.stringify(db[name] || {});
}

async function init({ skipSeed = false } = {}) {
  pool = mysql.createPool({ ...cfg(), connectionLimit: 5, waitForConnections: true });
  await createSchema();
  await acquireLock();
  db = await loadAll();

  if (!db.users.length && !skipSeed) {
    db = buildSeed();           // premier démarrage : comptes de démo + admin
    for (const name of Object.keys(META_DOCS)) { db[name] = META_DOCS[name](); dirtyMeta.add(name); }
    takeSnapshots();            // snapshots vides (rien encore en base)
    for (const name of Object.keys(COLLECTIONS)) snapshots[name] = new Map();
    metaSnapshot = '';
    for (const name of Object.keys(META_DOCS)) metaSnaps[name] = '';
    await persist();
  } else {
    takeSnapshots();
    if (syncAdminFromEnv(db)) await persist();
  }
  await flush();
  console.log(`✅ MySQL connecté (${process.env.DB_NAME}) — ${db.users.length} comptes, ${db.cars.length} voitures, ${db.requests.length} demandes.`);
}

function load() {
  if (!db) throw new Error('store.init() doit être appelé avant store.load()');
  return db;
}

// Calcule tout de suite (de façon synchrone) ce qui a changé depuis la
// dernière écriture, puis exécute les requêtes SQL en file d'attente.
function persist() {
  const ops = [];
  for (const [name, { table, cols }] of Object.entries(COLLECTIONS)) {
    const snap = snapshots[name];
    const current = new Set();
    for (const obj of db[name]) {
      current.add(obj.id);
      const json = JSON.stringify(obj);
      if (snap.get(obj.id) === json) continue;
      snap.set(obj.id, json);
      ops.push({ type: 'upsert', name, table, cols, id: obj.id, json, obj });
    }
    for (const id of [...snap.keys()]) {
      if (!current.has(id)) {
        snap.delete(id);
        ops.push({ type: 'delete', name, table, id });
      }
    }
  }
  const metaJson = JSON.stringify(db.seq);
  const metaChanged = metaJson !== metaSnapshot;
  if (metaChanged) metaSnapshot = metaJson;
  const metaDocOps = [];
  for (const name of [...dirtyMeta]) {
    const json = JSON.stringify(db[name] || {});
    if (json !== metaSnaps[name]) { metaSnaps[name] = json; metaDocOps.push({ name, json }); }
  }
  dirtyMeta.clear();
  if (!ops.length && !metaChanged && !metaDocOps.length) return writeQueue;

  writeQueue = writeQueue.then(async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const op of ops) {
        if (op.type === 'delete') {
          await conn.query(`DELETE FROM ${op.table} WHERE id = ?`, [op.id]);
        } else {
          const colNames = Object.keys(op.cols);
          const values = [op.id, ...colNames.map(c => op.cols[c](op.obj)), op.json];
          const fields = ['id', ...colNames, 'data'];
          const updates = [...colNames, 'data'].map(c => `${c} = VALUES(${c})`).join(', ');
          await conn.query(
            `INSERT INTO ${op.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updates}`,
            values
          );
        }
      }
      if (metaChanged) {
        await conn.query("INSERT INTO meta (k, v) VALUES ('seq', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)", [metaJson]);
      }
      for (const d of metaDocOps) {
        await conn.query('INSERT INTO meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [d.name, d.json]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      console.error('Erreur d\'écriture MySQL :', err.message);
      // On "oublie" ces lignes pour qu'elles soient réessayées au prochain persist().
      for (const op of ops) {
        if (op.type === 'upsert') snapshots[op.name].delete(op.id);
      }
      if (metaChanged) metaSnapshot = '';
      for (const d of metaDocOps) { metaSnaps[d.name] = ''; dirtyMeta.add(d.name); }
    } finally {
      conn.release();
    }
  });
  return writeQueue;
}

function flush() { return writeQueue; }

function nextId(key) {
  db.seq[key] = (db.seq[key] || 0) + 1;
  return db.seq[key];
}

async function close() {
  await flush();
  if (lockConn) { await lockConn.query('SELECT RELEASE_LOCK(?)', [`tomobiledz:${process.env.DB_NAME}`]).catch(() => {}); lockConn.release(); }
  if (pool) await pool.end();
}

module.exports = { init, load, persist, flush, close, touchMeta, nextId, get DATA_DIR() { return DATA_DIR; } };
