// Usage : npm run build   (à lancer sur votre PC, puis déployer le dossier public/)
// frontend-src/ (code lisible, PRIVÉ)  ->  public/ (code obfusqué, servi aux navigateurs)
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const CleanCSS = require('clean-css');

const SRC = path.join(__dirname, '..', 'frontend-src');
const OUT = path.join(__dirname, '..', 'public');

// Ordre : guard.js d'abord. Les fichiers restent séparés (CSP + service worker).
const files = fs.readdirSync(path.join(SRC, 'js')).filter(f => f.endsWith('.js'));
for (const f of files) {
  const code = fs.readFileSync(path.join(SRC, 'js', f), 'utf8');
  const heavy = f === 'app.js'; // early-lang/guard : options plus légères
  const out = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    renameGlobals: false,            // évite de casser window.TomobilePWA, etc.
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayThreshold: 0.75,
    stringArrayEncoding: heavy ? ['base64'] : [],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: heavy,
    splitStringsChunkLength: 8,
    controlFlowFlattening: false,    // trop lourd sur mobile
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,          // ne bloque pas les vrais utilisateurs
    disableConsoleOutput: true,
    sourceMap: false
  }).getObfuscatedCode();
  fs.writeFileSync(path.join(OUT, 'js', f), out);
  console.log('JS  ', f, code.length, '->', out.length);
}
const css = fs.readFileSync(path.join(SRC, 'css', 'style.css'), 'utf8');
const min = new CleanCSS({ level: 2 }).minify(css);
if (min.errors.length) throw new Error(min.errors.join('\n'));
fs.writeFileSync(path.join(OUT, 'css', 'style.css'), min.styles);
console.log('CSS ', css.length, '->', min.styles.length);
