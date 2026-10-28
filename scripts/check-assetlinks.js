// Vérifie que https://<domaine>/.well-known/assetlinks.json est correct
// (condition pour que l'APK (TWA) n'affiche pas la barre d'URL).
// Usage : npm run check:twa            (domaine par défaut : dzair-carosse.pro)
//         node scripts/check-assetlinks.js autre-domaine.com
const https = require('https');
const domain = process.argv[2] || 'dzair-carosse.pro';
const url = `https://${domain}/.well-known/assetlinks.json`;

https.get(url, (res) => {
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    const problems = [];
    if (res.statusCode !== 200) problems.push(`HTTP ${res.statusCode} (200 attendu, sans redirection)`);
    if (!/application\/json/i.test(res.headers['content-type'] || '')) problems.push('Content-Type n\'est pas application/json');
    let data;
    try { data = JSON.parse(body); } catch { problems.push('JSON invalide'); }
    if (data) {
      const t = (data[0] && data[0].target) || {};
      if (!t.package_name || /yourdomain|REPLACE/i.test(t.package_name)) problems.push('package_name non renseigné');
      const fps = t.sha256_cert_fingerprints || [];
      if (!fps.length || fps.some((f) => /REPLACE/i.test(f) || !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(f))) {
        problems.push('sha256_cert_fingerprints non renseigné ou mal formé (32 octets hex séparés par « : »)');
      }
    }
    console.log(url);
    if (problems.length) { console.log('✗ Problèmes :\n - ' + problems.join('\n - ')); process.exit(1); }
    console.log('✓ OK : la barre d\'URL doit disparaître (réinstallez l\'APK).');
  });
}).on('error', (e) => { console.log('✗ ' + e.message); process.exit(1); });
