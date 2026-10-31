const test = require('node:test');
const assert = require('node:assert/strict');
require('./load-locales.cjs');
const names = require('../src/jyotisha_ai/web/panchang-names.js');

test('named indices match the IMD Rashtriya Panchang ordered lists', () => {
  assert.equal(names.tithiName(1), 'Shukla Pratipad');
  assert.equal(names.tithiName(15), 'Purnima');
  assert.equal(names.tithiName(16), 'Krishna Pratipad');
  assert.equal(names.tithiName(20), 'Krishna Panchami');
  assert.equal(names.tithiName(30), 'Amavasya');
  assert.equal(names.nakshatraName(6), 'Ardra');
  assert.equal(names.nakshatraName(27), 'Revati');
  assert.equal(names.yogaName(20), 'Siva');
  assert.equal(names.yogaName(27), 'Vaidhriti');
  assert.equal(names.karanaName(1), 'Kimstughna');
  assert.equal(names.karanaName(2), 'Bava');
  assert.equal(names.karanaName(40), 'Taitila');
  assert.equal(names.karanaName(57), 'Vishti');
  assert.equal(names.karanaName(58), 'Sakuni');
  assert.equal(names.karanaName(59), 'Chatuspada');
  assert.equal(names.karanaName(60), 'Naga');
});

test('out-of-range indices never receive invented names', () => {
  for (const fn of [names.tithiName, names.nakshatraName, names.yogaName, names.karanaName]) {
    assert.equal(fn(0), null);
    assert.equal(fn(61), null);
    assert.equal(fn(1.5), null);
  }
});

test('Panchang indices retain their identity while displaying in the selected language', () => {
  assert.equal(names.tithiName(20,'te'),'కృష్ణ పంచమి');
  assert.equal(names.nakshatraName(6,'te'),'ఆర్ద్ర');
  assert.equal(names.yogaName(20,'te'),'శివ');
  assert.equal(names.karanaName(40,'te'),'తైతిల');
  assert.equal(names.tithiName(20,'hi'),'कृष्ण पंचमी');
  assert.equal(names.nakshatraName(6,'hi'),'आर्द्रा');
  assert.equal(names.tithiName(0,'te'),null);
});

test('base Tithi names drop the Paksha prefix for tight spaces such as calendar tiles', () => {
  assert.equal(names.tithiBaseName(5), 'Panchami');
  assert.equal(names.tithiBaseName(20), 'Panchami');
  assert.equal(names.tithiBaseName(15), 'Purnima');
  assert.equal(names.tithiBaseName(30), 'Amavasya');
  assert.equal(names.tithiBaseName(20, 'te'), 'పంచమి');
  assert.equal(names.tithiBaseName(0), null);
  assert.equal(names.tithiBaseName(31, 'hi'), null);
});
