// Dossiers de stockage persistant.
// STORAGE_DIR (optionnel) : dossier EN DEHORS du code de l'app, pour que les
// photos (uploads), les sessions et (sans MySQL) data/db.json survivent aux
// redéploiements/mises à jour. Par défaut : la racine du projet.
const path = require('path');
const fs = require('fs');

const ROOT = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(__dirname, '..');

const UPLOAD_DIR = path.join(ROOT, 'uploads');
const SESSIONS_DIR = path.join(ROOT, process.env.STORAGE_DIR ? 'sessions' : path.join('data', 'sessions'));
const DATA_DIR = path.join(ROOT, 'data');

for (const d of [UPLOAD_DIR, DATA_DIR]) fs.mkdirSync(d, { recursive: true });

module.exports = { ROOT, UPLOAD_DIR, SESSIONS_DIR, DATA_DIR };
