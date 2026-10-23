// Compteur de connexions : badge clignotant, visible uniquement quand l'admin est connecté.
(function () {
  var LABELS = { fr: 'Connexions', en: 'Logins', ar: 'تسجيلات الدخول' };
  var lang = 'fr';
  try { lang = (localStorage.getItem('dzair-carosse_lang') || 'fr').slice(0, 2); } catch (e) {}
  var label = LABELS[lang] || LABELS.fr;

  var css = document.createElement('style');
  css.textContent =
    '@keyframes dcBlink{0%,100%{opacity:1}50%{opacity:.25}}' +
    '#dc-counter{position:fixed;top:10px;right:10px;z-index:99999;display:none;align-items:center;gap:8px;' +
    'background:#10233F;color:#fff;border:2px solid #E2531F;border-radius:999px;padding:6px 14px;' +
    'font:700 14px Inter,Arial,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3);pointer-events:none}' +
    '#dc-counter .dot{width:10px;height:10px;border-radius:50%;background:#2ECC71;animation:dcBlink 1s infinite}' +
    '#dc-counter .n{font-size:18px;color:#FFD34D;animation:dcBlink 1s infinite}';
  document.head.appendChild(css);

  var box = document.createElement('div');
  box.id = 'dc-counter';
  box.innerHTML = '<span class="dot"></span><span class="l"></span><span class="n">0</span>';
  document.body.appendChild(box);
  box.querySelector('.l').textContent = label;

  function refresh() {
    fetch('/api/admin/analytics?days=7', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.logins) {
          box.querySelector('.n').textContent = d.logins.total;
          box.title = label + ' — ' + d.logins.today + ' / 24h';
          box.style.display = 'flex';
        } else box.style.display = 'none';
      })
      .catch(function () { box.style.display = 'none'; });
  }
  refresh();
  setInterval(refresh, 15000);
})();
