const { translate } = require('../lib/i18n-server');

const { dealerWilaya } = require('../lib/wilayas');

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  if (rest.role === 'dealer') rest.wilaya = dealerWilaya(u);
  return rest;
}

// requireAuth() -> juste connecté
// requireAuth('dealer') -> connecté ET rôle dealer
// requireAuth('dealer', 'admin') -> connecté ET rôle dealer ou admin
function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: translate(req.lang, 'auth.notLoggedIn') });
    }
    if (roles.length && !roles.includes(req.session.role)) {
      return res.status(403).json({ error: translate(req.lang, 'auth.wrongAccountType') });
    }
    next();
  };
}

module.exports = { requireAuth, publicUser };
