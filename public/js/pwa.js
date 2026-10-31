/* =========================================================
   DZair Carrosse — installation en app (PWA)
   =========================================================
   Trois façons d'installer, par ordre de préférence :

   1) Invite native du navigateur (Chrome/Edge/Android...) : le navigateur
      nous confie l'évènement `beforeinstallprompt`, qu'on déclenche au
      moment choisi par l'utilisateur.
   2) Bouton « Installer l'app » toujours présent dans le menu tant que le
      site n'est pas installé — indispensable, car le bandeau automatique
      ne s'affiche qu'une fois et certains navigateurs n'émettent jamais
      l'évènement natif (Safari, Firefox, Samsung Internet...).
   3) Mode d'emploi manuel, adapté au navigateur détecté, quand aucune
      invite native n'est disponible.

   Expose window.DzairCarrossePWA pour que l'interface (public/js/app.js) sache
   s'il faut afficher le bouton et puisse déclencher l'installation.
   ========================================================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker non enregistré :', err);
    });
  });
}

window.DzairCarrossePWA = (function () {
  const DISMISS_KEY = 'dzair-carrosse_install_dismissed';
  let deferredPrompt = null;

  function tr(key, fallback) {
    return typeof t === 'function' ? t(key) : (fallback || key);
  }

  function isStandalone() {
    try {
      return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
        || window.navigator.standalone === true; // Safari iOS
    } catch (e) { return false; }
  }

  // Détection du navigateur, uniquement pour afficher le bon mode d'emploi.
  // L'ordre compte : sur iOS, tous les navigateurs utilisent le moteur de
  // Safari et passent par le même menu Partager.
  function platform() {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    if (/android/i.test(ua)) {
      if (/samsungbrowser/i.test(ua)) return 'samsung';
      if (/firefox|fxios/i.test(ua)) return 'firefox';
      return 'android';
    }
    if (/firefox/i.test(ua)) return 'firefox';
    if (/edg/i.test(ua)) return 'desktop';
    if (/chrome|chromium/i.test(ua)) return 'desktop';
    if (/safari/i.test(ua)) return 'macsafari';
    return 'other';
  }

  function instructionsKey() {
    switch (platform()) {
      case 'ios': return 'pwa.howto.ios';
      case 'android': return 'pwa.howto.android';
      case 'samsung': return 'pwa.howto.samsung';
      case 'firefox': return 'pwa.howto.firefox';
      case 'macsafari': return 'pwa.howto.macsafari';
      case 'desktop': return 'pwa.howto.desktop';
      default: return 'pwa.howto.other';
    }
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function rememberDismissed() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function removeBanner() {
    const el = document.getElementById('pwaInstallBar');
    if (el) el.remove();
  }

  // --- Mode d'emploi manuel (quand aucune invite native n'existe) -------
  function showInstructions() {
    if (document.getElementById('pwaHowto')) return;
    const overlay = document.createElement('div');
    overlay.id = 'pwaHowto';
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="modal pwa-howto-modal">
        <div class="modal-body">
          <button class="modal-close" type="button" data-pwa-close>×</button>
          <h2 style="margin:0 0 10px">${tr('pwa.howtoTitle')}</h2>
          <p style="line-height:1.6;margin:0 0 18px">${tr(instructionsKey())}</p>
          <button class="btn-primary" type="button" data-pwa-close style="width:100%">${tr('pwa.gotIt')}</button>
        </div>
      </div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.hasAttribute('data-pwa-close')) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  // --- Déclenche l'installation (appelé par le bouton du menu) ----------
  async function promptInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      removeBanner();
      refreshUi();
      return;
    }
    // Pas d'invite native disponible : on explique la marche à suivre.
    showInstructions();
  }

  // --- Bandeau automatique (une seule fois, refermable) -----------------
  function showBanner() {
    if (isStandalone() || wasDismissed() || document.getElementById('pwaInstallBar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwaInstallBar';
    bar.className = 'pwa-install-bar';
    bar.innerHTML = `
      <span>${tr('pwa.installPrompt')}</span>
      <div class="pwa-install-actions">
        <button type="button" class="pwa-install-btn" id="pwaInstallGo">${tr('pwa.installBtn')}</button>
        <button type="button" class="pwa-install-dismiss" id="pwaInstallDismiss" aria-label="${tr('pwa.later')}">✕</button>
      </div>`;
    document.body.appendChild(bar);

    document.getElementById('pwaInstallDismiss').addEventListener('click', () => {
      rememberDismissed();
      removeBanner();
    });
    document.getElementById('pwaInstallGo').addEventListener('click', promptInstall);
  }

  // Redessine l'interface pour que le bouton du menu apparaisse/disparaisse.
  function refreshUi() {
    if (typeof render === 'function') {
      try { render(); } catch (e) {}
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Ni bouton dans le menu ni bandeau : l'installation n'est plus proposée.
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    rememberDismissed();
    removeBanner();
    refreshUi();
  });

  // Navigateurs sans évènement natif (iOS en tête) : on propose quand même
  // le bandeau, qui renverra vers le mode d'emploi manuel.

  return {
    // L'interface affiche le bouton tant que l'app n'est pas installée.
    // On ne conditionne PAS à deferredPrompt : sans lui, le bouton ouvre
    // le mode d'emploi, ce qui reste utile (Safari, Firefox...).
    shouldOfferInstall: () => false,
    isInstalled: isStandalone,
    promptInstall,
    showInstructions
  };
})();
