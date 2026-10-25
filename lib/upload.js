const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { translate } = require('./i18n-server');

const { UPLOAD_DIR } = require('./paths');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  }
});

const ALLOWED = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.includes(ext) || !file.mimetype.startsWith('image/')) {
    const err = new Error(translate(req.lang, 'upload.badType'));
    err.status = 400; err.expose = true; // message sûr, affiché tel quel
    return cb(err);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 6 * 1024 * 1024, files: 6, fields: 40, fieldSize: 64 * 1024, parts: 60 } // 6 Mo / fichier
});

// Supprime un fichier photo du disque à partir de l'URL stockée en base
// (ex: "/uploads/ab12cd.jpg"). Ignore silencieusement les photos externes
// (ex: démo Unsplash) ou déjà absentes du disque.
function deletePhotoFile(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return;
  const filename = path.basename(photoUrl);
  const filePath = path.join(UPLOAD_DIR, filename);
  if (path.dirname(filePath) !== UPLOAD_DIR) return; // garde-fou anti path-traversal
  fs.unlink(filePath, () => {}); // on ignore l'erreur si le fichier n'existe déjà plus
}


// ---- Vérification du CONTENU des images -----------------------------------------
// L'extension et le type MIME viennent du navigateur : ils peuvent être falsifiés.
// On vérifie donc la « signature » réelle du fichier (JPEG, PNG, GIF, WEBP) ; tout
// autre contenu est supprimé et refusé. Les fichiers envoyés par une requête qui
// finit en erreur (>= 400) sont aussi supprimés, pour ne laisser aucun orphelin.
const SIGNATURES = [
  b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF,                                  // JPEG
  b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47,                  // PNG
  b => b.toString('latin1', 0, 4) === 'GIF8',                                              // GIF
  b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'    // WEBP
];
function isRealImage(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    return SIGNATURES.some(check => check(b));
  } catch (e) { return false; }
}
function filesOf(req) {
  const out = [];
  if (req.file) out.push(req.file);
  if (req.files) (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()).forEach(f => out.push(f));
  return out;
}
function imageGuard(req, res, next) {
  const files = filesOf(req);
  const removeAll = () => files.forEach(f => fs.unlink(f.path, () => {}));
  if (!files.every(f => isRealImage(f.path))) {
    removeAll();
    return res.status(400).json({ error: translate(req.lang, 'upload.badType') });
  }
  res.on('finish', () => { if (res.statusCode >= 400) removeAll(); });
  // Les champs texte d'un formulaire multipart doivent eux aussi être de simples chaînes.
  require('../middleware/sanitize').normalizeBody(req, res, next);
}
const uploadSingle = (name) => [upload.single(name), imageGuard];

// ---- Photos d'un véhicule : 3 emplacements (0 = extérieur, 1 = intérieur, 2 = côté).
// car.photos = [ext, int, côté] ; car.photo = première photo disponible (couverture
// utilisée par les cartes et la liste). Les anciennes annonces n'ont que car.photo.
const CAR_PHOTO_FIELDS = ['photo', 'photo_interior', 'photo_side'];
const carUpload = [upload.fields(CAR_PHOTO_FIELDS.map(name => ({ name, maxCount: 1 }))), imageGuard];

function carPhotoSlots(car) {
  if (Array.isArray(car.photos)) return [0, 1, 2].map(i => car.photos[i] || '');
  return [car.photo || '', '', ''];
}

function setCarPhotos(car, slots) {
  car.photos = [0, 1, 2].map(i => slots[i] || '');
  car.photo = car.photos.find(Boolean) || '';
}

function deleteCarPhotos(car) {
  carPhotoSlots(car).forEach(deletePhotoFile);
}

// Fichiers reçus par carUpload, dans l'ordre des emplacements (undefined si absent).
function uploadedCarFiles(req) {
  const files = req.files || {};
  return CAR_PHOTO_FIELDS.map(name => (files[name] && files[name][0]) || undefined);
}

// Supprime les fichiers reçus quand la requête est finalement refusée (évite les orphelins).
function discardUploaded(req) {
  uploadedCarFiles(req).forEach(f => f && deletePhotoFile('/uploads/' + f.filename));
}

module.exports = {
  upload, uploadSingle, imageGuard, UPLOAD_DIR, deletePhotoFile,
  CAR_PHOTO_FIELDS, carUpload, carPhotoSlots, setCarPhotos, deleteCarPhotos, uploadedCarFiles, discardUploaded
};
