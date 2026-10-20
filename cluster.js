// Lance un worker Node par cœur de CPU disponible, chacun exécutant le
// serveur Express (server.js) et écoutant sur le même port (le module
// cluster répartit les connexions entrantes entre les workers). Un seul
// process Node ne peut utiliser qu'un seul cœur ; pour tenir un nombre
// important de connexions simultanées (ex: ~1000), répartir la charge sur
// tous les cœurs disponibles est l'amélioration la plus efficace.
//
// IMPORTANT : avec plusieurs workers, les sessions en mémoire
// (MemoryStore) ne sont PAS partagées — un même utilisateur pourrait être
// "déconnecté" selon le worker qui traite sa requête. Avant de lancer ce
// mode, définir SESSION_STORE=file dans .env (voir server.js), ou mettre en
// place un store partagé (Redis...) pour un usage multi-serveurs.
//
// Utilisation : npm run start:cluster
if (process.env.DB_NAME || require('fs').existsSync(require('path').join(__dirname, '.env'))) {
  require('dotenv').config();
}
if (process.env.DB_NAME) {
  console.error('❌ Le mode cluster n\'est pas supporté avec MySQL (cache en mémoire, une seule instance). Utilisez : npm start');
  process.exit(1);
}
const cluster = require('cluster');
const os = require('os');

const numWorkers = Number(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary || cluster.isMaster) {
  console.log(`DZair Carrosse — démarrage en cluster (${numWorkers} worker(s))`);
  if (process.env.SESSION_STORE !== 'file') {
    console.warn('⚠️  SESSION_STORE=file n\'est pas défini : les sessions ne seront pas partagées entre workers. Voir .env.example.');
  }

  for (let i = 0; i < numWorkers; i++) cluster.fork();

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`Worker ${worker.process.pid} arrêté (code ${code}, signal ${signal}) — redémarrage.`);
    cluster.fork();
  });
} else {
  require('./server.js');
}
