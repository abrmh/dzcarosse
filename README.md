# DZair Carrosse — backend Node.js

Marketplace de voitures façon La Centrale : les concessionnaires publient leur stock
(visible par tout le monde), les particuliers déposent une annonce avec photo pour
vendre leur voiture (visible **uniquement** par les concessionnaires, qui peuvent
ensuite les contacter pour acheter).

## Installation

```bash
npm install
cp .env.example .env    # puis modifiez SESSION_SECRET et les identifiants admin
npm start
```

Le site est disponible sur **http://localhost:3000**.

Le fichier `.env` définit les identifiants du compte administrateur créé au tout premier démarrage :

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-admin-password
ADMIN_NAME=Administrateur
```

⚠️ Ces valeurs ne sont lues qu'à la création initiale de `data/db.json`. Si ce fichier existe déjà (vous avez déjà lancé le site une fois), les modifier dans `.env` n'aura aucun effet. Pour changer le mot de passe admin ensuite, deux solutions :
- connectez-vous et utilisez le menu **Mon profil** (en haut à droite) — c'est la méthode normale, valable pour tous les comptes (admin, concessionnaire, particulier) ;
- ou supprimez `data/db.json` pour repartir d'une base neuve avec les valeurs du `.env` (⚠️ cela efface aussi toutes les voitures et annonces).

Au premier démarrage, la base est créée automatiquement avec :
- le compte admin défini par votre `.env`
- (uniquement avec `SEED_DEMO=1`, jamais en production) deux comptes concessionnaire de démo : `alger-auto` / `dealer123` et `oran-motors` / `dealer123`
- quelques voitures d'exemple avec de vraies photos

Pensez à changer les mots de passe de démo avant toute mise en ligne réelle.

## Comment ça marche

- **Visiteur / particulier** : parcourt librement le stock des concessionnaires sur la page d'accueil.
- **Particulier connecté** : peut déposer une annonce ("Vendre ma voiture") avec une vraie photo envoyée depuis son appareil, ses infos véhicule et son téléphone. Cette annonce est stockée mais **jamais renvoyée par l'API publique** — seuls les comptes `dealer` et `admin` peuvent la consulter (`GET /api/requests`).
- **Concessionnaire** : compte créé uniquement par l'admin (aucune auto-inscription possible). Il publie ses véhicules avec photo, prix, et ses coordonnées de contact (affichées à l'acheteur sur l'annonce publique). Il consulte aussi la liste des annonces déposées par les particuliers et peut les contacter par téléphone pour organiser un rachat.
- **Admin** : crée/supprime les comptes concessionnaire et a une vue d'ensemble (statistiques, liste des comptes, et les messages reçus via la page Contact).
- **Page Contact** : accessible à tous (même sans compte) depuis le menu. Les messages envoyés arrivent dans l'espace Administration, où l'admin peut les lire, les marquer comme lus/non lus et les supprimer.

### Téléphone : obligatoire, mais non vérifié

Le numéro de téléphone est **obligatoire** à l'inscription et ne peut pas être vidé
depuis le profil — c'est le seul moyen pour un concessionnaire de recontacter un
vendeur particulier. Son format est validé (côté navigateur *et* côté serveur) pour
écarter les saisies manifestement erronées.

En revanche, il n'y a **aucune confirmation par SMS** : le numéro n'est donc pas
*prouvé*, et rien n'empêche quelqu'un de saisir un numéro valide en apparence mais
qui ne lui appartient pas. C'est un choix assumé (parcours d'inscription sans
friction, aucun coût d'envoi de SMS). Si vous constatez plus tard des annonces avec
de faux numéros, la confirmation par SMS est la parade classique — elle demande un
fournisseur payant (Twilio, Vonage…) et rajoute une étape à l'inscription.

## Sécurité mise en place

- Mots de passe hachés avec `bcryptjs` (jamais stockés ni renvoyés en clair), 8 caractères minimum.
- Authentification par session (cookie `httpOnly`, `sameSite: lax`, `secure` en production), stockée côté serveur.
- Contrôle des rôles sur chaque route sensible (`requireAuth('dealer')`, etc.) — un particulier ne peut pas lister les annonces des autres particuliers, un concessionnaire ne peut modifier que ses propres véhicules.
- Upload de photo filtré par extension + type MIME (image uniquement) et limité à 6 Mo (`multer`) ; noms de fichiers générés aléatoirement (jamais le nom d'origine envoyé par l'utilisateur) ; garde-fou anti path-traversal à la suppression.
- **En-têtes de sécurité HTTP** (`helmet`) : Content-Security-Policy stricte (pas de script inline), anti-clickjacking (`X-Frame-Options`/`frame-ancestors`), `X-Content-Type-Options: nosniff`, HSTS, etc.
- **Anti-injection de script (XSS)** : tout texte utilisateur affiché est échappé côté frontend (`esc()`), et les gestionnaires d'erreur d'image ne sont plus des attributs `onerror="..."` inline construits avec du texte utilisateur (un vecteur XSS classique) mais une délégation d'évènement lisant `dataset` (jamais interprété comme du code).
- **Anti-pollution de prototype / mass-assignment** : les clés `__proto__`, `constructor`, `prototype` sont retirées de `req.body`/`req.query`/`req.params` sur toutes les routes (`middleware/sanitize.js`).
- **Anti-pollution de paramètres HTTP** (`hpp`) : une valeur de paramètre dupliquée (`?maxPrice=100&maxPrice=0`) ne peut plus être utilisée pour contourner un filtre.
- **Limitation de débit** (`express-rate-limit`) : 300 requêtes/15 min/IP sur l'API en général, 20 tentatives/15 min/IP sur les routes sensibles (connexion, inscription) — protège contre le brute-force de mot de passe et les scripts d'abus automatisés.
- **Formulaire de contact public** : seule route d'écriture ouverte sans compte. Elle est donc plus strictement limitée (5 messages/heure/IP par défaut, `CONTACT_RATE_LIMIT_MAX`), avec longueurs de champs plafonnées et validation du format email/téléphone. Le contenu est stocké tel quel et échappé à l'affichage (`esc()`), jamais interprété comme du HTML.
- **CORS** : aucune origine externe autorisée par défaut (l'app est servie en same-origin) ; configurable via `CORS_ORIGIN` si le frontend est un jour déployé séparément.
- **Injection SQL** : sans objet actuellement — l'app n'utilise aucune base de données SQL, uniquement un fichier JSON (`lib/store.js`) avec des accès en mémoire (`Array.find`, jamais de requête construite à partir de texte utilisateur). **Si vous migrez vers Postgres/MySQL (recommandé en production, voir plus bas), utilisez systématiquement des requêtes paramétrées ou un ORM (Prisma, Sequelize, Knex...) — jamais de concaténation de chaînes dans une requête SQL.**
- **Démarrage bloqué en production** sans `SESSION_SECRET` ni `ADMIN_PASSWORD` définis avec une vraie valeur (plus de valeur par défaut silencieuse en prod).
- Identifiants (`username`) validés par un format strict (lettres/chiffres/`.`/`_`/`-`, 3 à 32 caractères).

### Ce que l'app ne peut pas faire seule : la protection DDoS

La limitation de débit ci-dessus atténue les abus applicatifs (un script qui martèle le login, par exemple), mais **ne protège pas contre une attaque DDoS volumétrique** (des milliers de machines qui saturent la bande passante ou les connexions réseau) : à ce niveau, Node.js/Express ne peut rien faire seul. Cette protection doit venir de l'infrastructure en amont :
- un CDN/WAF comme **Cloudflare** (ou équivalent) devant le serveur ;
- ou, a minima, un reverse proxy (nginx) avec ses propres limites de connexions/débit.

Pour une mise en production réelle, il faudra aussi : HTTPS (souvent terminé par le reverse proxy/CDN), une vraie base de données (Postgres/MySQL) à la place du fichier JSON pour un fort volume, et un stockage de fichiers externalisé (S3…) plutôt que le disque local.

## MySQL, migration et comptes inactifs

- **MySQL / MariaDB** : définir `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` dans `.env` (voir `.env.example`). Sans `DB_NAME`, l'app garde le fichier `data/db.json` (dev local). Les tables sont créées automatiquement au premier démarrage.
- **Importer l'ancienne base** : arrêter l'app, puis `npm run migrate:mysql` (lit `data/db.json`).
- **Une seule instance** : les données sont mises en cache mémoire et écrites ligne par ligne dans MySQL ; un verrou MySQL empêche de lancer deux instances. **`npm run start:cluster` est désactivé avec MySQL** (ignorer les conseils "cluster" ci-dessous). Pour monter en charge : VPS plus gros, Cloudflare devant.
- **Comptes inactifs** : un compte *particulier* sans connexion depuis `INACTIVE_DAYS` jours (défaut 60) est supprimé automatiquement avec ses annonces et photos (`lib/cleanup.js`, vérification toutes les 6 h). Dealers et admin ne sont jamais supprimés. Les comptes existants avant cette fonction démarrent leur délai de 2 mois au premier lancement.

## Scalabilité — tenir ~1000 connexions simultanées

Node.js gère nativement des milliers de connexions **entrantes** simultanées sur un seul process grâce à sa boucle d'événements non bloquante — ce n'est généralement pas la limite. Les leviers mis en place ou disponibles ici :

1. **Écritures disque non bloquantes** (`lib/store.js`) : la base JSON est maintenant écrite de façon asynchrone et mise en file (au lieu d'un `writeFileSync` qui bloquait toute la boucle d'événements — donc toutes les autres requêtes en cours — à chaque création/modification).
2. **Réglages serveur adaptés à la charge** (`server.js`) : `keepAliveTimeout`/`headersTimeout` généreux pour ne pas couper les connexions HTTP persistantes trop tôt sous forte charge, `requestTimeout` contre les requêtes anormalement lentes, compression gzip (`compression`) pour réduire la bande passante utilisée par connexion.
3. **Utiliser tous les cœurs CPU** : un seul process Node n'utilise qu'un seul cœur. `npm run start:cluster` (voir `cluster.js`) lance un worker par cœur disponible, ce qui multiplie la capacité de traitement en charge CPU. **Prérequis** : définir `SESSION_STORE=file` dans `.env` pour que les sessions soient partagées entre workers (sinon un utilisateur connecté sur un worker peut sembler déconnecté sur un autre).
4. **Au-delà d'un seul serveur** : répartir la charge sur plusieurs machines derrière un load balancer (le module `cluster` ne fonctionne qu'au sein d'une seule machine). Il faudra alors un store de session partagé entre serveurs (Redis, par exemple, à la place de `session-file-store`) et, pour un fort volume d'écritures, remplacer le fichier JSON par une vraie base de données (Postgres/MySQL) qui gère nativement les accès concurrents.

En résumé : pour un usage réel à ce niveau de trafic, la combinaison recommandée est **CDN/WAF (Cloudflare) → reverse proxy (nginx) → plusieurs instances Node en cluster ou sur plusieurs machines → base de données réelle**, plutôt que de tout faire reposer sur un seul process et un fichier JSON.

## Langues (FR / EN / AR)

Le frontend est disponible en français, anglais et arabe (avec bascule automatique
en RTL — mise en page de droite à gauche — pour l'arabe).

- `public/js/i18n.js` : dictionnaire de traductions (`I18N`) et fonctions `t(clé, variables)`,
  `getLang()` / `setLang()` (choix persisté dans `localStorage`), `plural()` pour les compteurs.
- Le sélecteur de langue (FR / EN / عربي) est dans l'en-tête du site, sur toutes les pages.
- Par défaut, la langue du navigateur est utilisée si elle est supportée, sinon le français.
- Le CSS gère l'arabe via `[dir="rtl"]` dans `public/css/style.css` (miroir de la mise en page :
  navigation, formulaires, tableaux, fiche véhicule...) et une police adaptée (Cairo) est chargée
  aux côtés des polices latines.

**Ajouter une langue** : dupliquer un bloc dans `I18N` (ex. copier `en` vers `es`), traduire
chaque valeur, ajouter le code dans `SUPPORTED_LANGS` (et dans `RTL_LANGS` si la langue s'écrit
de droite à gauche), puis ajouter un libellé dans `renderLangSwitch()` (`public/js/app.js`).
Faire de même côté serveur dans `lib/i18n-server.js` (dictionnaire `MESSAGES` et
`SUPPORTED_LANGS`) pour que les messages d'erreur de l'API suivent.

**Messages de l'API traduits eux aussi** : chaque appel `fetch` du frontend envoie l'en-tête
`X-Lang` avec la langue actuellement choisie sur le site (voir `api()` dans `public/js/app.js`).
Le serveur lit cet en-tête (`lib/i18n-server.js`, middleware `detectLangMiddleware`) et renvoie
les messages d'erreur de validation dans la langue de
l'utilisateur au moment de son action — sans avoir besoin de stocker une préférence de langue
en base de données.

## Monnaie

Les prix sont affichés en dinar algérien (**DA** en français/anglais, **دج** en arabe) via
`fmtPrice()` dans `public/js/app.js`. Pour repasser en euros ou une autre devise, modifier
cette fonction ainsi que les libellés `field.price` / `field.priceWanted` / `home.pricePlaceholder`
dans `public/js/i18n.js` (les 3 langues).

## Application mobile (PWA — installable sur téléphone)

Le site est une **Progressive Web App** : sur Android (Chrome/Edge) et iOS (Safari),
les visiteurs peuvent l'installer sur leur écran d'accueil et l'utiliser comme une
app — icône, écran de démarrage, plein écran (sans barre du navigateur), et un
minimum de contenu accessible hors-ligne.

- `public/manifest.json` : nom, icônes, couleurs, mode d'affichage (`standalone`).
- `public/sw.js` : service worker — met en cache la coquille de l'app (HTML/CSS/JS/icônes)
  pour un démarrage rapide et hors-ligne. Il ne met **jamais** en cache l'API ni les
  photos (`/api/*`, `/uploads/*`) : ces données restent toujours à jour.
- `public/js/pwa.js` : enregistre le service worker et propose l'installation de
  **trois façons complémentaires** :
  1. **Invite native** du navigateur quand il la propose (Chrome/Edge/Android, via
     l'évènement `beforeinstallprompt`) — l'installation se fait en un clic.
  2. **Bouton « Installer l'app »** toujours visible dans le menu tant que le site
     n'est pas installé. C'est le point important : le bandeau automatique ne
     s'affiche qu'une fois et peut être refermé définitivement, et plusieurs
     navigateurs (Safari, Firefox, Samsung Internet) n'émettent jamais d'évènement
     natif. Sans ce bouton, ces visiteurs n'auraient aucun moyen d'installer l'app.
  3. **Mode d'emploi adapté au navigateur** quand aucune invite native n'existe :
     une fenêtre explique la marche à suivre selon l'appareil détecté (Safari iOS,
     Chrome Android, Samsung Internet, Firefox, Safari macOS, Chrome/Edge bureau,
     ou instructions génériques en dernier recours).

  Le bouton disparaît automatiquement une fois l'app installée (détection via
  `display-mode: standalone`). Le bandeau, lui, ne se réaffiche pas après fermeture
  ou installation (mémorisé en `localStorage`).
- `public/icons/` : icônes générées aux formats requis (192/512, standard et *maskable*
  pour Android qui peut découper l'icône en cercle/squircle).

**Prérequis pour que l'installation fonctionne** : le site doit être servi en **HTTPS**
(les navigateurs n'autorisent les service workers qu'en HTTPS, `localhost` excepté pour
les tests). C'est une raison de plus, en plus de la sécurité, de mettre un reverse proxy
ou un CDN devant le serveur en production (voir « Sécurité mise en place » ci-dessus).

**Changer l'icône** : régénérer les fichiers dans `public/icons/` (n'importe quel outil
d'export d'icônes PWA convient) en gardant les mêmes noms et tailles que dans
`manifest.json`, ou en mettant à jour ce dernier si vous changez les noms.

**Aller plus loin (app dans les stores)** : cette PWA peut être publiée telle quelle sur
l'App Store / Google Play via [Capacitor](https://capacitorjs.com), qui l'enveloppe dans
une coquille native sans réécrire le frontend — utile si vous avez besoin plus tard de
notifications push ou d'API natives que le web ne permet pas.

## Structure du projet

```
server.js              point d'entrée Express
cluster.js               lance un worker par cœur CPU (npm run start:cluster)
lib/store.js            couche de données (fichier JSON, à remplacer par une vraie BDD si besoin)
lib/upload.js            configuration multer (upload des photos)
lib/i18n-server.js       traductions FR/EN/AR des messages de l'API (erreurs de validation)
middleware/auth.js       vérification de session + rôle
middleware/sanitize.js   anti-pollution de prototype (__proto__, constructor...)
routes/auth.js           inscription / connexion / déconnexion
routes/admin.js          création des comptes concessionnaire, statistiques
routes/cars.js           annonces publiques des concessionnaires
routes/requests.js       annonces privées des particuliers (dealer/admin uniquement)
routes/messages.js       page Contact : dépôt public, lecture/gestion par l'admin
public/                  frontend (HTML/CSS/JS, consomme l'API via fetch)
public/js/i18n.js        traductions FR/EN/AR + helpers (t, getLang, setLang)
public/js/pwa.js         installation en app (service worker + bandeau "Installer")
public/sw.js             service worker (coquille hors-ligne)
public/manifest.json     manifeste PWA (icônes, couleurs, mode plein écran)
public/icons/            icônes de l'app (192/512, standard + maskable)
uploads/                 photos envoyées par les utilisateurs (créé automatiquement)
data/db.json             base de données (créée automatiquement au premier lancement)
```

## API — résumé

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Créer un compte particulier |
| POST | `/api/auth/login` | public | Connexion |
| POST | `/api/auth/logout` | connecté | Déconnexion |
| GET | `/api/auth/me` | public | Session courante |
| PUT | `/api/auth/me` | connecté | Modifier mon propre profil / mot de passe (tous rôles) |
| GET | `/api/cars` | public | Liste des voitures des concessionnaires (`?q=&fuel=&maxPrice=`) |
| GET | `/api/cars/:id` | public | Détail d'une voiture |
| POST | `/api/cars` | dealer | Publier une voiture (`multipart/form-data`, champ `photo`) |
| PUT | `/api/cars/:id` | dealer (propriétaire) | Modifier une voiture |
| DELETE | `/api/cars/:id` | dealer (propriétaire) | Supprimer une voiture |
| POST | `/api/requests` | user | Déposer une annonce de vente (`multipart/form-data`, champ `photo`) |
| GET | `/api/requests` | dealer, admin | Liste de toutes les annonces des particuliers |
| GET | `/api/requests/mine` | user | Mes annonces |
| PUT | `/api/requests/:id` | user (propriétaire) | Modifier mon annonce |
| DELETE | `/api/requests/:id` | user (propriétaire) | Supprimer mon annonce |
| POST | `/api/messages` | public | Envoyer un message depuis la page Contact |
| GET | `/api/messages` | admin | Lire les messages reçus (+ nombre de non lus) |
| PUT | `/api/messages/:id/read` | admin | Marquer un message lu / non lu |
| DELETE | `/api/messages/:id` | admin | Supprimer un message |
| POST | `/api/admin/dealers` | admin | Créer un compte concessionnaire |
| GET | `/api/admin/accounts` | admin | Liste des comptes (`?role=dealer` ou `?role=user`) |
| PUT | `/api/admin/accounts/:id` | admin | Modifier un compte (dont réinitialisation du mot de passe) |
| DELETE | `/api/admin/accounts/:id` | admin | Supprimer un compte et ses annonces |
| GET | `/api/admin/stats` | admin | Statistiques globales |
| GET | `/api/admin/storage` | admin | Espace disque utilisé + détail des photos |
| DELETE | `/api/admin/cars/:id/photo` | admin | Retirer la photo d'une voiture (l'annonce reste) |
| DELETE | `/api/admin/requests/:id/photo` | admin | Retirer la photo d'une annonce particulier |
| DELETE | `/api/admin/cars/:id` | admin | Supprimer une voiture |
| DELETE | `/api/admin/requests/:id` | admin | Supprimer une annonce particulier |
