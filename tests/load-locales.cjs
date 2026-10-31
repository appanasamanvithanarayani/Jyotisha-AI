/* Test helper: populate globalThis.JyotishaLocales exactly as /locales.js does in the browser. */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', 'src', 'jyotisha_ai', 'web', 'locales');
for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.js')).sort()) require(path.join(dir, name));
module.exports = globalThis.JyotishaLocales;
