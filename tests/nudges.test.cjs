const test = require('node:test');
const assert = require('node:assert/strict');
const nudges = require('../src/jyotisha_ai/web/nudges.js');

test('every language has all 12 Moon houses, 7 weekdays, special tithis, questions and muhurta wordings', () => {
  const tithiKeys = [...new Set(Object.values(nudges.TITHI_KEYS))];
  for (const lang of ['en', 'te', 'hi']) {
    assert.equal(nudges.HOUSES[lang].length, 12, lang);
    assert.equal(nudges.WEEKDAYS[lang].length, 7, lang);
    for (const row of [...nudges.HOUSES[lang], ...nudges.WEEKDAYS[lang], ...Object.values(nudges.TITHIS[lang])]) {
      assert.equal(row.length, 3, `${lang}: title, body, question`);
      assert.ok(row.every(text => typeof text === 'string' && text.trim().length > 3), lang);
    }
    assert.deepEqual(Object.keys(nudges.TITHIS[lang]).sort(), tithiKeys.sort(), lang);
    assert.ok(nudges.QUESTIONS[lang].length >= 20, lang);
    assert.equal(nudges.QUESTIONS[lang].length, nudges.QUESTIONS.en.length, `${lang} has the same questions as English`);
    nudges.QUESTIONS[lang].forEach((item, index) => {
      assert.equal(item.need, nudges.QUESTIONS.en[index].need, `${lang} question ${index} audience`);
      assert.ok(item.t && item.b && (item.ask || item.page), `${lang} question ${index}`);
      if (item.need === 'dasha') assert.ok(item.t.includes('{dasha}') && item.ask.includes('{dasha}'));
      if (item.ask) assert.ok(item.ask.length <= 300);
    });
    for (const kind of ['good', 'bad']) {
      assert.equal(nudges.MUHURTA[lang][kind].length, 3, `${lang} ${kind}`);
      assert.ok(nudges.MUHURTA[lang][kind].every(([title, body]) => title && body.includes('{end}')), `${lang} ${kind}`);
    }
  }
  assert.equal(nudges.pick(nudges.HOUSES, 'ta'), nudges.HOUSES.en);   // other languages fall back to English
});
