// Dissuasion DevTools (léger, contournable : ne remplace pas l'obfuscation).
(function () {
  var block = function (e) { e.preventDefault(); e.stopPropagation(); return false; };
  document.addEventListener('contextmenu', function (e) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return; // garder copier/coller dans les champs
    block(e);
  });
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase();
    if (e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(k) !== -1) ||
        ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's')) ||
        (e.metaKey && e.altKey && ['i', 'j', 'u'].indexOf(k) !== -1)) {
      block(e);
    }
  }, true);
})();
