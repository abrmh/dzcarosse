// Validation des champs d'une annonce (véhicule ou demande de particulier).
// Refuse les valeurs absurdes : nombres négatifs / énormes / non numériques,
// textes démesurés, carburant ou boîte inconnus. Les champs absents ou vides
// sont ignorés ici (leur caractère obligatoire est vérifié par les routes).
const FUELS = ['Essence', 'Diesel', 'Électrique', 'Hybride', 'GPL'];
const GEARBOX = ['Manuelle', 'Automatique'];
const MAX_LEN = { brand: 60, model: 60, city: 80, color: 40, description: 2000, contactName: 100, contactPhone: 30, phone: 30 };
const PHONE_RE = /^[+]?[\d\s.()-]{8,20}$/;

const isInt = (v, min, max) => /^\d{1,12}$/.test(String(v).trim()) && Number(v) >= min && Number(v) <= max;

function checkListing(body) {
  const b = body || {};
  const has = k => b[k] !== undefined && String(b[k]).trim() !== '';

  for (const [k, max] of Object.entries(MAX_LEN)) {
    if (b[k] !== undefined && String(b[k]).trim().length > max) return false;
  }
  if (has('year') && !isInt(b.year, 1950, new Date().getFullYear() + 1)) return false;
  if (has('km') && !isInt(b.km, 0, 2000000)) return false;
  if (has('price') && !isInt(b.price, 1, 100000000000)) return false;
  if (has('fuel') && !FUELS.includes(String(b.fuel))) return false;
  if (has('gearbox') && !GEARBOX.includes(String(b.gearbox))) return false;
  for (const k of ['contactPhone', 'phone']) {
    if (has(k) && !PHONE_RE.test(String(b[k]).trim())) return false;
  }
  return true;
}

module.exports = { checkListing };
