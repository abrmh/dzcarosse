# Protéger le code visible dans F12 / Inspecter

Sur votre PC (Node 18+), dans ce dossier :

    npm install
    npm run build

Cela lit `frontend-src/` (code lisible, à garder PRIVÉ) et écrit le code obfusqué dans `public/`.
Ensuite déployez sur Hostinger comme d'habitude. Pensez à incrémenter `CACHE_VERSION` dans `public/sw.js`.
Modifiez toujours `frontend-src/`, jamais `public/js` directement (il serait écrasé au prochain build).
