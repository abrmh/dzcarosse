/* =========================================================
   DZair Carrosse -- service worker (hors-ligne / cache)
   =========================================================
   Aucun bouton ni bandeau « Installer l'app » n'est affiché.
   On empêche aussi le mini-bandeau d'installation du navigateur.
   window.DzairCarossePWA reste exposé (valeurs neutres) pour app.js.
   ========================================================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker non enregistré :', err);
    });
  });
}

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); });

window.DzairCarossePWA = {
  shouldOfferInstall: () => false,
  isInstalled: () => false,
  promptInstall: async () => {}
};
