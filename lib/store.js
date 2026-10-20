// Sélection du backend de stockage :
//  - DB_NAME défini  -> MySQL / MariaDB (production, ex. Hostinger)
//  - sinon           -> fichier data/db.json (développement local)
// Même API dans les deux cas : init(), load(), persist(), flush(), nextId().
module.exports = process.env.DB_NAME ? require('./store-mysql') : require('./store-json');
