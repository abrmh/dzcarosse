// Suppression automatique des comptes PARTICULIERS inactifs.
// - Un compte "user" (ni concessionnaire, ni admin) qui ne s'est pas connecté
//   depuis INACTIVE_DAYS jours (défaut : 60 = 2 mois) est supprimé, avec ses
//   annonces (demandes de vente) et leurs photos.
// - Les comptes dealer et admin ne sont JAMAIS supprimés automatiquement.
// - "Activité" = connexion, ou ouverture de l'app avec une session encore
//   valide (mise à jour au plus une fois par jour, voir routes/auth.js).
const store = require('./store');
const { deletePhotoFile } = require('./upload');

const DAY = 24 * 60 * 60 * 1000;

function inactiveDays() {
  const n = Number(process.env.INACTIVE_DAYS);
  return n > 0 ? n : 60;
}

function run() {
  require('./security').purge(); // IP/événements au-delà de SECURITY_RETENTION_DAYS
  const db = store.load();
  const now = Date.now();
  let touched = false;

  // Comptes antérieurs à cette fonctionnalité : on démarre leur compteur
  // maintenant (délai de grâce) au lieu de les supprimer d'un coup.
  for (const u of db.users) {
    if (u.role === 'user' && !u.lastActiveAt) { u.lastActiveAt = now; touched = true; }
  }

  const limit = now - inactiveDays() * DAY;
  const stale = db.users.filter(u => u.role === 'user' && u.lastActiveAt < limit);
  if (stale.length) {
    const ids = new Set(stale.map(u => u.id));
    db.requests.filter(r => ids.has(r.userId)).forEach(r => deletePhotoFile(r.photo));
    db.requests = db.requests.filter(r => !ids.has(r.userId));
    db.users = db.users.filter(u => !ids.has(u.id));
    console.log(`🧹 ${stale.length} compte(s) particulier(s) inactif(s) depuis plus de ${inactiveDays()} jours supprimé(s) avec leurs annonces.`);
    touched = true;
  }
  if (touched) store.persist();
  return stale.length;
}

function start() {
  setTimeout(run, 60 * 1000).unref();          // 1 min après le démarrage
  setInterval(run, 6 * 60 * 60 * 1000).unref(); // puis toutes les 6 h
}

module.exports = { run, start };
