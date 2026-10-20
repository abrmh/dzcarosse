// Marques de voitures : liste de référence + normalisation.
// Sert au formulaire d'ajout de véhicule (autocomplétion) et évite les doublons
// du type "dacia" / "Dacia" / "DACIA".
const KNOWN_BRANDS = [
  'Alfa Romeo', 'Audi', 'Baic', 'BMW', 'BYD', 'Changan', 'Chery', 'Chevrolet', 'Citroën', 'Cupra', 'Dacia',
  'Daihatsu', 'DFSK', 'Dongfeng', 'DS', 'Fiat', 'Ford', 'Foton', 'Geely', 'Great Wall', 'Haval', 'Honda',
  'Hyundai', 'Isuzu', 'Iveco', 'JAC', 'Jaguar', 'Jeep', 'Jetour', 'Kia', 'Lada', 'Land Rover', 'Lexus',
  'Lifan', 'Mahindra', 'Maserati', 'Mazda', 'Mercedes', 'MG', 'Mini', 'Mitsubishi', 'Nissan', 'Opel',
  'Peugeot', 'Porsche', 'Renault', 'Seat', 'Skoda', 'Smart', 'SsangYong', 'Subaru', 'Suzuki', 'Tata',
  'Tesla', 'Toyota', 'Volkswagen', 'Volvo'
];

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

// Écriture propre d'une marque saisie à la main : espaces nettoyés ; si tout est
// en minuscules, majuscule à chaque mot ("land rover" -> "Land Rover").
function formatBrand(input) {
  const s = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (s && s === s.toLowerCase()) return s.replace(/(^|[\s-])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
  return s;
}

// Marques connues (liste de référence + marques déjà en base), sans doublons.
function brandMap(db) {
  const map = new Map();
  KNOWN_BRANDS.forEach(b => map.set(norm(b), b));
  [...db.cars, ...db.requests].forEach(x => {
    const b = String(x.brand || '').replace(/\s+/g, ' ').trim();
    if (b && !map.has(norm(b))) map.set(norm(b), b);
  });
  return map;
}

function brandOptions(db) {
  return [...brandMap(db).values()].sort((a, b) => a.localeCompare(b));
}

// Écriture canonique : "dacia" -> "Dacia" si elle existe ; sinon marque nouvelle, nettoyée.
function canonicalBrand(db, input) {
  const s = formatBrand(input);
  return brandMap(db).get(norm(s)) || s;
}

module.exports = { KNOWN_BRANDS, norm, formatBrand, brandOptions, canonicalBrand };
