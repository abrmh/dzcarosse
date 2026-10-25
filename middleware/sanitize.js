const { translate } = require('../lib/i18n-server');

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

// Normalise le corps de la requête : l'API n'attend que des valeurs simples (texte,
// nombre, booléen). Un objet ou un tableau (ex. {"password": {"a": 1}} ou un champ
// répété) est refusé, et les nombres / booléens deviennent du texte. Cela évite les
// erreurs de type (.trim() sur un tableau, etc.) et toute confusion de type.
function normalizeBody(req, res, next) {
  const body = req.body;
  if (body && typeof body === 'object') {
    for (const key of Object.keys(body)) {
      const v = body[key];
      if (v === null || v === undefined) { delete body[key]; continue; }
      if (typeof v === 'object') {
        return res.status(400).json({ error: translate(req.lang, 'generic.badRequest') });
      }
      if (typeof v !== 'string') body[key] = String(v);
    }
  }
  next();
}

module.exports = { sanitizeInput, stripDangerousKeys, normalizeBody };
