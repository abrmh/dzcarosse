// Appliqué avant le premier rendu (donc avant le CSS/JS principal) pour
// éviter un flash visible en LTR si l'utilisateur avait choisi l'arabe
// lors d'une visite précédente.
(function () {
  try {
    var lang = localStorage.getItem('tomobiledz_lang') || (navigator.language || 'fr').slice(0, 2);
    if (['fr', 'en', 'ar'].indexOf(lang) === -1) lang = 'fr';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  } catch (e) { /* localStorage indisponible (mode privé strict, etc.) */ }
})();
