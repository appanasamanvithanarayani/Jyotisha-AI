const test = require('node:test');
const assert = require('node:assert/strict');
require('./load-locales.cjs');
const calendar = require('../src/jyotisha_ai/web/calendar-ui.js');

test('supported interface languages have the same translation keys', () => {
  const english = Object.keys(calendar.COPY.en).sort();
  assert.deepEqual(Object.keys(calendar.COPY.te).sort(), english);
  assert.deepEqual(Object.keys(calendar.COPY.hi).sort(), english);
  assert.equal(calendar.language('fr'), 'en');
  assert.equal(calendar.tr('te', 'welcome'), 'జ్యోతిష AI కి స్వాగతం');
});

test('month grid is Monday-first and includes every leap-day date', () => {
  const cells = calendar.monthCells(2024, 2);
  assert.equal(cells.filter(day => day !== null).length, 29);
  assert.equal(cells[0], null);
  assert.equal(cells[3], 1);
  assert.equal(cells.at(-1), 29);
  assert.equal(calendar.isoDate(2024, 2, 29), '2024-02-29');
  assert.throws(() => calendar.monthCells(1969, 12));
});

test('month and weekday labels use the selected browser locale', () => {
  assert.match(calendar.monthTitle(2026, 10, 'en'), /October/);
  assert.equal(calendar.weekdayLabels('en').length, 7);
  assert.equal(calendar.weekdayLabels('en')[0], 'Mon');
});
