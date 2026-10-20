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
    return cb(new Error(translate(req.lang, 'upload.badType')));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 6 * 1024 * 1024 } // 6 Mo
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

// ---- Photos d'un véhicule : 3 emplacements (0 = extérieur, 1 = intérieur, 2 = côté).
// car.photos = [ext, int, côté] ; car.photo = première photo disponible (couverture
// utilisée par les cartes et la liste). Les anciennes annonces n'ont que car.photo.
const CAR_PHOTO_FIELDS = ['photo', 'photo_interior', 'photo_side'];
const carUpload = upload.fields(CAR_PHOTO_FIELDS.map(name => ({ name, maxCount: 1 })));

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
  upload, UPLOAD_DIR, deletePhotoFile,
  CAR_PHOTO_FIELDS, carUpload, carPhotoSlots, setCarPhotos, deleteCarPhotos, uploadedCarFiles, discardUploaded
};
