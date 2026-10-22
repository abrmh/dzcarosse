// Usage : npm run build   (à lancer sur votre PC, puis déployer le dossier public/)
// frontend-src/ (code lisible, PRIVÉ)  ->  public/ (code obfusqué, servi aux navigateurs)
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'frontend-src');
const OUT = path.join(__dirname, '..', 'public');

// Si les outils de protection ne sont pas installés (hébergeur qui n'installe pas
// tout, mémoire insuffisante...), on ne fait PAS échouer le déploiement : le code
// lisible de frontend-src/ est simplement copié tel quel dans public/.
let JavaScriptObfuscator, CleanCSS;
try {
  JavaScriptObfuscator = require('javascript-obfuscator');
  CleanCSS = require('clean-css');
} catch (e) {
  console.warn('[build] javascript-obfuscator / clean-css introuvables : copie sans obfuscation (' + e.message.split('\n')[0] + ')');
  for (const f of fs.readdirSync(path.join(SRC, 'js')).filter(x => x.endsWith('.js'))) {
    fs.copyFileSync(path.join(SRC, 'js', f), path.join(OUT, 'js', f));
    console.log('JS  ', f, '(copie)');
  }
  fs.copyFileSync(path.join(SRC, 'css', 'style.css'), path.join(OUT, 'css', 'style.css'));
  console.log('CSS style.css (copie)');
  process.exit(0);
}

// Ordre : guard.js d'abord. Les fichiers restent séparés (CSP + service worker).
const files = fs.readdirSync(path.join(SRC, 'js')).filter(f => f.endsWith('.js'));
for (const f of files) {
  const code = fs.readFileSync(path.join(SRC, 'js', f), 'utf8');
  const heavy = f === 'app.js'; // early-lang/guard : options plus légères
  const out = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    renameGlobals: false,            // évite de casser window.DzairCarossePWA, etc.
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
