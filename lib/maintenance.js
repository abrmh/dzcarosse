// Mode maintenance : MAINTENANCE_MODE=1 (variable d'environnement) met le site
// "en pause" — les visiteurs voient une page d'attente (HTTP 503) et l'API est
// fermée. Pour rouvrir : supprimer la variable (ou MAINTENANCE_MODE=0) puis
// redéployer/redémarrer. Les données (MySQL, photos) ne sont pas touchées.
// Restent accessibles : politique de confidentialité, page de suppression de
// compte (exigées par Google Play), assets Android (.well-known), icônes.
const ALLOWED = [
  /^\/privacy\.html$/, /^\/delete-account\.html$/, /^\/\.well-known\//,
  /^\/manifest\.json$/, /^\/favicon\.ico$/, /^\/icons\//
];

const PAGE = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><meta name="theme-color" content="#10233F">
<title>DZair Carrosse — Maintenance</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#10233F;color:#fff;font:17px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;padding:24px}
  .box{max-width:460px}h1{font-size:30px;margin:0 0 6px}.dot{color:#E2531F}
  p{margin:8px 0;color:#C4CEDD}.ar{direction:rtl}a{color:#fff}
</style></head><body><div class="box">
  <h1><span class="dot">●</span> DZair Carrosse</h1>
  <p><b>Le site est temporairement en maintenance.</b><br>Merci de votre patience, nous revenons très bientôt.</p>
  <p>The site is temporarily down for maintenance. Please check back soon.</p>
  <p class="ar">الموقع في صيانة مؤقتة. نعود قريبًا، شكرًا لصبركم.</p>
  <p style="margin-top:22px;font-size:14px"><a href="/privacy.html">Confidentialité / Privacy</a></p>
</div></body></html>`;

function enabled() {
  const v = String(process.env.MAINTENANCE_MODE || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function middleware(req, res, next) {
  if (!enabled()) return next();
  if (ALLOWED.some(re => re.test(req.path))) return next();
  res.set('Retry-After', '3600');
  res.set('Cache-Control', 'no-store');
  if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Site en maintenance. Revenez bientôt.' });
  res.status(503).type('html').send(PAGE);
}

module.exports = { middleware, enabled };
