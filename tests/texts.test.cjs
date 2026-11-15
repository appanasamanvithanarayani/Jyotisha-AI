/* Every texts/<code>.js must mirror the English words of the newer screens: same keys, same list lengths, same {placeholders}. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '..', 'src', 'jyotisha_ai', 'web');
const source = fs.readFileSync(path.join(web, 'app.js'), 'utf8');
function table(name) {
  const start = source.indexOf(`const ${name} = {`);
  let depth = 0, index = source.indexOf('{', start);
  const from = index;
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') { depth -= 1; if (depth === 0) break; }
    else if (char === "'" || char === '"' || char === '`') { index += 1; while (source[index] !== char) { if (source[index] === '\\') index += 1; index += 1; } }
  }
  return eval(`(${source.slice(from, index + 1)})`).en;
}
const english = { love: table('RELATIONSHIP_COPY'), tools: table('TOOLS_COPY'), teaser: table('TEASER_COPY'), more: table('MORE_COPY'), facts: table('FUN_FACTS') };

globalThis.window = globalThis;
globalThis.JyotishaTexts = {};
const dir = path.join(web, 'texts');
for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.js'))) require(path.join(dir, name));

const holes = text => (String(text).match(/\{[a-zA-Z]+\}/g) || []).sort().join(',');
function compare(want, got, where, problems) {
  if (Array.isArray(want)) {
    if (!Array.isArray(got) || got.length !== want.length) { problems.push(`${where}: expected a list of ${want.length}`); return; }
    want.forEach((item, i) => compare(item, got[i], `${where}[${i}]`, problems));
  } else if (want && typeof want === 'object') {
    if (!got || typeof got !== 'object') { problems.push(`${where}: missing`); return; }
    for (const key of Object.keys(want)) compare(want[key], got[key], `${where}.${key}`, problems);
    for (const key of Object.keys(got)) if (!(key in want)) problems.push(`${where}.${key}: not in English`);
  } else if (typeof got !== 'string' || !got.trim()) problems.push(`${where}: missing text`);
  else if (holes(want) !== holes(got)) problems.push(`${where}: placeholders ${holes(got) || 'none'} differ from ${holes(want) || 'none'}`);
}

for (const [code, words] of Object.entries(globalThis.JyotishaTexts)) {
  test(`texts/${code}.js has every English text, with the same placeholders`, () => {
    const problems = [];
    compare(english, words, code, problems);
    assert.deepEqual(problems, []);
  });
}
test('at least one language ships its own words', () => assert.ok(Object.keys(globalThis.JyotishaTexts).length >= 1));
