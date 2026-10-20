// Les 58 wilayas d'Algérie : [code, nom français, nom arabe].
// Le code (« 16 ») est ce qui est stocké sur le compte concessionnaire ; les noms
// servent à l'affichage. La même liste est dans frontend-src/js/app.js.
const WILAYAS = [
  ['01', 'Adrar', 'أدرار'], ['02', 'Chlef', 'الشلف'], ['03', 'Laghouat', 'الأغواط'],
  ['04', 'Oum El Bouaghi', 'أم البواقي'], ['05', 'Batna', 'باتنة'], ['06', 'Béjaïa', 'بجاية'],
  ['07', 'Biskra', 'بسكرة'], ['08', 'Béchar', 'بشار'], ['09', 'Blida', 'البليدة'],
  ['10', 'Bouira', 'البويرة'], ['11', 'Tamanrasset', 'تمنراست'], ['12', 'Tébessa', 'تبسة'],
  ['13', 'Tlemcen', 'تلمسان'], ['14', 'Tiaret', 'تيارت'], ['15', 'Tizi Ouzou', 'تيزي وزو'],
  ['16', 'Alger', 'الجزائر'], ['17', 'Djelfa', 'الجلفة'], ['18', 'Jijel', 'جيجل'],
  ['19', 'Sétif', 'سطيف'], ['20', 'Saïda', 'سعيدة'], ['21', 'Skikda', 'سكيكدة'],
  ['22', 'Sidi Bel Abbès', 'سيدي بلعباس'], ['23', 'Annaba', 'عنابة'], ['24', 'Guelma', 'قالمة'],
  ['25', 'Constantine', 'قسنطينة'], ['26', 'Médéa', 'المدية'], ['27', 'Mostaganem', 'مستغانم'],
  ['28', "M'Sila", 'المسيلة'], ['29', 'Mascara', 'معسكر'], ['30', 'Ouargla', 'ورقلة'],
  ['31', 'Oran', 'وهران'], ['32', 'El Bayadh', 'البيض'], ['33', 'Illizi', 'إليزي'],
  ['34', 'Bordj Bou Arréridj', 'برج بوعريريج'], ['35', 'Boumerdès', 'بومرداس'], ['36', 'El Tarf', 'الطارف'],
  ['37', 'Tindouf', 'تندوف'], ['38', 'Tissemsilt', 'تيسمسيلت'], ['39', 'El Oued', 'الوادي'],
  ['40', 'Khenchela', 'خنشلة'], ['41', 'Souk Ahras', 'سوق أهراس'], ['42', 'Tipaza', 'تيبازة'],
  ['43', 'Mila', 'ميلة'], ['44', 'Aïn Defla', 'عين الدفلى'], ['45', 'Naâma', 'النعامة'],
  ['46', 'Aïn Témouchent', 'عين تموشنت'], ['47', 'Ghardaïa', 'غرداية'], ['48', 'Relizane', 'غليزان'],
  ['49', 'Timimoun', 'تيميمون'], ['50', 'Bordj Badji Mokhtar', 'برج باجي مختار'], ['51', 'Ouled Djellal', 'أولاد جلال'],
  ['52', 'Béni Abbès', 'بني عباس'], ['53', 'In Salah', 'عين صالح'], ['54', 'In Guezzam', 'عين قزام'],
  ['55', 'Touggourt', 'تقرت'], ['56', 'Djanet', 'جانت'], ['57', 'El M’Ghair', 'المغير'],
  ['58', 'El Meniaa', 'المنيعة']
];

const BY_CODE = new Map(WILAYAS.map(w => [w[0], w]));

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’`]/g, "'").replace(/^(wilaya\s+(de|d')\s*)/, '').replace(/[^a-z0-9\u0600-\u06ff']+/g, ' ').trim();
const BY_NAME = new Map();
for (const [code, fr, ar] of WILAYAS) { BY_NAME.set(norm(fr), code); BY_NAME.set(norm(ar), code); }

function isValidWilaya(code) { return BY_CODE.has(String(code)); }
function wilayaName(code) { const w = BY_CODE.get(String(code)); return w ? w[1] : ''; }

// Comptes créés avant l'ajout de la liste : on retrouve la wilaya à partir de
// l'ancienne « ville » saisie à la main (ex. « Alger », « Wilaya de Oran »).
function guessWilaya(city) { return BY_NAME.get(norm(city)) || ''; }

// Wilaya d'un concessionnaire : celle choisie dans la liste, sinon déduite de l'ancienne ville.
function dealerWilaya(user) {
  if (!user) return '';
  return isValidWilaya(user.wilaya) ? String(user.wilaya) : guessWilaya(user.city);
}

module.exports = { WILAYAS, isValidWilaya, wilayaName, guessWilaya, dealerWilaya };
