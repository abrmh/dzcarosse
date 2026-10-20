const bcrypt = require('bcryptjs');

// Données initiales + synchro du compte admin, partagées par store-json.js
// et store-mysql.js.
function buildSeed() {
  const db = {
    seq: { users: 0, cars: 0, requests: 0, messages: 0 },
    users: [],
    cars: [],
    requests: [],
    messages: []
  };

  const addUser = (u) => {
    db.seq.users += 1;
    db.users.push({ id: db.seq.users, ...u, createdAt: Date.now() });
    return db.seq.users;
  };

  addUser({
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
    role: 'admin',
    name: process.env.ADMIN_NAME || 'Administrateur',
    city: '',
    phone: ''
  });

  addUser({
    username: 'alger-auto',
    passwordHash: bcrypt.hashSync('dealer123', 10),
    role: 'dealer',
    name: 'Alger Auto Sélection',
    wilaya: '16',
    city: 'Alger',
    phone: '021 65 22 33'
  });

  addUser({
    username: 'oran-motors',
    passwordHash: bcrypt.hashSync('dealer123', 10),
    role: 'dealer',
    name: 'Oran Motors',
    wilaya: '31',
    city: 'Oran',
    phone: '041 33 11 22'
  });

  const addCar = (dealerId, c) => {
    db.seq.cars += 1;
    db.cars.push({ id: db.seq.cars, dealerId, ...c, createdAt: Date.now() });
  };

  // Photos de démo (Unsplash, libres de droits) — les vraies annonces
  // utiliseront des photos envoyées par les concessionnaires/particuliers.
  addCar(2, { brand: 'Peugeot', model: '308', year: 2021, price: 2650000, km: 44600, fuel: 'Essence', gearbox: 'Manuelle', color: 'Gris platine', city: 'Alger', description: "Peugeot 308 Active, entretien à jour, carnet complet, contrôle technique fourni.", photo: 'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=900&q=80&auto=format', contactName: 'Alger Auto Sélection', contactPhone: '021 65 22 33' });
  addCar(2, { brand: 'Renault', model: 'Clio V', year: 2022, price: 2150000, km: 21000, fuel: 'Essence', gearbox: 'Manuelle', color: 'Bleu iron', city: 'Alger', description: "Clio V citadine, première main, faible kilométrage, climatisation automatique.", photo: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=900&q=80&auto=format', contactName: 'Alger Auto Sélection', contactPhone: '021 65 22 33' });
  addCar(3, { brand: 'Volkswagen', model: 'Golf 8', year: 2020, price: 3250000, km: 58200, fuel: 'Diesel', gearbox: 'Automatique', color: 'Noir intense', city: 'Oran', description: "Golf 8 TDI DSG, sièges chauffants, écran tactile 10 pouces, garantie 12 mois incluse.", photo: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=900&q=80&auto=format', contactName: 'Oran Motors', contactPhone: '041 33 11 22' });
  addCar(3, { brand: 'BMW', model: 'Série 3', year: 2019, price: 4550000, km: 71000, fuel: 'Diesel', gearbox: 'Automatique', color: 'Blanc alpin', city: 'Oran', description: "BMW Série 3 320d Business, toit ouvrant, GPS professionnel, sièges cuir.", photo: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=900&q=80&auto=format', contactName: 'Oran Motors', contactPhone: '041 33 11 22' });

  if (!process.env.ADMIN_PASSWORD) {
    console.warn('\n⚠️  Aucun ADMIN_PASSWORD défini dans .env — le compte admin a été créé avec le mot de passe par défaut "admin123". Changez-le au plus vite (menu Administration > mon profil), ou définissez ADMIN_PASSWORD dans .env puis supprimez data/db.json pour regénérer la base avant le premier lancement.\n');
  }

  return db;
}

function syncAdminFromEnv(database) {
  const admin = database.users.find(u => u.role === 'admin');
  if (!admin) return false;

  let changed = false;

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_USERNAME !== admin.username) {
    const taken = database.users.some(
      u => u.id !== admin.id && u.username.toLowerCase() === process.env.ADMIN_USERNAME.toLowerCase()
    );
    if (taken) {
      console.warn(`\n⚠️  ADMIN_USERNAME="${process.env.ADMIN_USERNAME}" est déjà utilisé par un autre compte — identifiant admin inchangé (${admin.username}).\n`);
    } else {
      admin.username = process.env.ADMIN_USERNAME;
      changed = true;
    }
  }

  if (process.env.ADMIN_PASSWORD && !bcrypt.compareSync(process.env.ADMIN_PASSWORD, admin.passwordHash)) {
    admin.passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
    changed = true;
  }

  if (process.env.ADMIN_NAME && process.env.ADMIN_NAME !== admin.name) {
    admin.name = process.env.ADMIN_NAME;
    changed = true;
  }

  if (changed) console.log('✅ Compte admin resynchronisé depuis .env.');
  return changed;
}

module.exports = { buildSeed, syncAdminFromEnv };
