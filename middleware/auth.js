const { translate } = require('../lib/i18n-server');

const { dealerWilaya } = require('../lib/wilayas');
const store = require('../lib/store');

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, sessionsValidFrom, ...rest } = u;
  if (rest.role === 'dealer') rest.wilaya = dealerWilaya(u);
  return rest;
}

// Une session n'est plus valable si le compte n'existe plus, si son rôle a changé, ou si le
// mot de passe a été modifié APRÈS la connexion de cette session (user.sessionsValidFrom).
function sessionRevoked(req, user) {
  return !user || user.role !== req.session.role || (user.sessionsValidFrom || 0) > (req.session.loginAt || 0);
}

// requireAuth() -> juste connecté
// requireAuth('dealer') -> connecté ET rôle dealer
// requireAuth('dealer', 'admin') -> connecté ET rôle dealer ou admin
function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: translate(req.lang, 'auth.notLoggedIn') });
    }
    // Session révoquée (mot de passe changé / réinitialisé, compte supprimé) : on la ferme.
    if (sessionRevoked(req, store.load().users.find(x => x.id === req.session.userId))) {
      return req.session.destroy(() => res.status(401).json({ error: translate(req.lang, 'auth.notLoggedIn') }));
    }
    if (roles.length && !roles.includes(req.session.role)) {
      return res.status(403).json({ error: translate(req.lang, 'auth.wrongAccountType') });
    }
    next();
  };
}

module.exports = { requireAuth, publicUser, sessionRevoked };
