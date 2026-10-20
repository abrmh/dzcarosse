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

module.exports = { upload, UPLOAD_DIR, deletePhotoFile };
