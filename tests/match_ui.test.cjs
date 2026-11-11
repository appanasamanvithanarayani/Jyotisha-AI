const test = require('node:test');
const assert = require('node:assert/strict');
const { gunaMilan, tables } = require('../src/jyotisha_ai/web/match-ui.js');

const NAK = 360 / 27;
const mid = n => (n - 1) * NAK + NAK / 2;   // middle of Nakshatra n (1 = Ashwini)

test('lookup tables are complete and the Yoni table is symmetric', () => {
  for (const list of [tables.YONI_OF, tables.GANA_OF, tables.NADI_OF]) assert.equal(list.length, 27);
  for (let a = 0; a < 14; a += 1) for (let b = 0; b < 14; b += 1) assert.equal(tables.YONI[a][b], tables.YONI[b][a], `${a},${b}`);
  for (let n = 0; n < 3; n += 1) assert.equal(tables.NADI_OF.filter(x => x === n).length, 9);
  for (let g = 0; g < 3; g += 1) assert.equal(tables.GANA_OF.filter(x => x === g).length, 9);
});

test('same Moon position: everything matches except Nadi', () => {
  const result = gunaMilan(mid(17), mid(17));
  const points = Object.fromEntries(result.kootas.map(k => [k.key, k.points]));
  assert.deepEqual(points, { varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, gana: 6, bhakoot: 7, nadi: 0 });
  assert.equal(result.total, 28); assert.equal(result.verdict, 'good'); assert.equal(result.nadiDosha, true);
});

test('scores stay within 0..36 for every Nakshatra pair and kootas never exceed their maximum', () => {
  for (let g = 1; g <= 27; g += 1) for (let b = 1; b <= 27; b += 1) {
    const result = gunaMilan(mid(g), mid(b));
    assert.ok(result.total >= 0 && result.total <= 36);
    for (const koota of result.kootas) assert.ok(koota.points >= 0 && koota.points <= koota.max, `${g}/${b} ${koota.key}`);
  }
});

test('known pairs: sworn-enemy Yoni, Bhakoot 6/8 and different Nadi', () => {
  // Ashwini (Horse, Adi) with Hasta (Buffalo, Adi): sworn enemies, same Nadi.
  let result = gunaMilan(mid(1), mid(13));
  assert.equal(result.kootas.find(k => k.key === 'yoni').points, 0);
  assert.equal(result.nadiDosha, true);
  // Aries groom and Virgo bride are 6/8 apart: Bhakoot dosha.
  result = gunaMilan(mid(1), mid(13));
  assert.equal(result.bhakootDosha, true);
  // Ashwini (Adi) with Bharani (Madhya): different Nadi earns 8.
  assert.equal(gunaMilan(mid(1), mid(2)).kootas.find(k => k.key === 'nadi').points, 8);
  assert.throws(() => gunaMilan(NaN, 10));
});
