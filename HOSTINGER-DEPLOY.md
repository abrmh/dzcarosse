# Déploiement Hostinger (Business) + Google Play

## 1. Node.js sur Hostinger
1. hPanel → **Websites → Add website → Node.js Apps**.
2. Importez ce dossier (zip **sans** node_modules) ou connectez le repo GitHub. Node 18+ (20 ou 22 recommandé).
3. Start command : `npm start` — fichier d'entrée : `server.js`.
4. Variables d'environnement (voir `.env.example`) : `NODE_ENV=production`, `SESSION_SECRET` (long, aléatoire), `ADMIN_PASSWORD`, `SESSION_STORE=file`.
5. Domaine + SSL (HTTPS) activés. **Sans cluster** (`npm start`, pas `start:cluster`).
6. Ne pas écraser `uploads/` (et `data/` si vous restez sans MySQL) lors d'un redéploiement.

## 1bis. Base MySQL (recommandé)
1. hPanel → **Bases de données → Gestion** : créer une base + un utilisateur (noter nom, utilisateur, mot de passe).
2. Ajouter dans les variables d'environnement : `DB_HOST=localhost`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (+ `INACTIVE_DAYS=60`).
3. Si vous avez déjà des données (`data/db.json`) : les importer une fois, app arrêtée, avec `npm run migrate:mysql` (terminal SSH ou console Node de hPanel).
4. Les tables se créent seules. **Ne pas** utiliser `start:cluster`.
5. Sauvegardes : exporter la base depuis phpMyAdmin + dossier `uploads/`.

## 1quater. Ne rien perdre lors des mises à jour
- **Comptes, annonces, messages** : dans MySQL → jamais touchés par un redéploiement.
- **Photos** : fichiers sur disque → définir `STORAGE_DIR` vers un dossier HORS de l'app (ex. `/home/u123456789/tomobiledz-storage`, créé tout seul au démarrage). Le chemin de ton dossier personnel s'affiche dans le Gestionnaire de fichiers / en SSH avec `pwd`.
- Ne jamais mettre `.env`, `uploads/` ni `data/` dans Git (déjà dans `.gitignore`).
- Avant chaque grosse mise à jour : export phpMyAdmin + copie de `STORAGE_DIR`.

## 1cinq. Mettre le site en pause
Variable d'environnement `MAINTENANCE_MODE=1` puis **Redéployer** → page « en maintenance » (503), API fermée, données intactes.
Pour rouvrir : supprimer la variable (ou `0`) puis **Redéployer**.

## 1ter. Comptes inactifs
Les comptes **particuliers** sans connexion depuis 2 mois sont supprimés automatiquement avec leurs annonces (dealers/admin jamais). Réglable via `INACTIVE_DAYS`.

## 2. Personnaliser
- `public/privacy.html` et `public/delete-account.html` : remplacez `[VOTRE EMAIL]` / `[VOTRE NOM / SOCIÉTÉ]`.
- Vérifiez : https://VOTREDOMAINE/privacy.html

## 3. Application Android (TWA)
1. https://www.pwabuilder.com → votre URL → Android → package ex. `com.votredomaine.tomobiledz` → générer (.aab + keystore : **gardez-les**).
2. Copiez le SHA-256 du certificat dans `well-known/assetlinks.json` (+ le bon `package_name`), redéployez.
3. Vérifiez : https://VOTREDOMAINE/.well-known/assetlinks.json
4. Play Console : upload .aab, fiche, politique de confidentialité = https://VOTREDOMAINE/privacy.html, URL de suppression de compte = https://VOTREDOMAINE/delete-account.html, Data safety, classification.
