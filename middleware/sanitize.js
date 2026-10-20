// Retire récursivement les clés dangereuses (__proto__, constructor,
// prototype) de req.body / req.query / req.params.
//
// Pourquoi : Express/body-parser construit des objets JS classiques à partir
// du JSON ou du form envoyé par le client. Un attaquant peut envoyer un champ
// nommé "__proto__" (ex: {"__proto__": {"isAdmin": true}}) pour tenter de
// polluer Object.prototype et, selon comment les objets sont ensuite
// fusionnés/lus ailleurs dans l'app ou ses dépendances, provoquer des bugs
// de sécurité (contournement de contrôle d'accès, DoS, etc.). Cette
// vérification est bon marché et s'applique par défaut à toutes les routes.
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function stripDangerousKeys(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    for (const item of value) stripDangerousKeys(item, depth + 1);
    return value;
  }

  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      delete value[key];
      continue;
    }
    stripDangerousKeys(value[key], depth + 1);
  }
  return value;
}

function sanitizeInput(req, res, next) {
  if (req.body) stripDangerousKeys(req.body);
  if (req.query) stripDangerousKeys(req.query);
  if (req.params) stripDangerousKeys(req.params);
  next();
}

module.exports = { sanitizeInput, stripDangerousKeys };
