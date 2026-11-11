/* Ashtakoota Guna Milan (36 points) from the two Moon positions. Conventional textbook tables; not expert-reviewed.
   Works in the browser (window.matchUI) and in Node tests (module.exports). */
(function (root) {
  'use strict';
  const NAK = 360 / 27;
  const norm = value => ((value % 360) + 360) % 360;
  const sign = lon => Math.floor(norm(lon) / 30);            // 0 = Aries
  const nakshatra = lon => Math.min(26, Math.floor(norm(lon) / NAK));  // 0 = Ashwini

  // 1. Varna (1): Brahmin 4 > Kshatriya 3 > Vaishya 2 > Shudra 1, by Moon sign.
  const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
  // 2. Vashya (2): 0 Chatushpada, 1 Manava, 2 Jalachara, 3 Vanachara, 4 Keeta.
  function vashyaGroup(lon) {
    const s = sign(lon), firstHalf = norm(lon) % 30 < 15;
    return [0, 0, 1, 2, 3, 1, 1, 4, firstHalf ? 1 : 0, firstHalf ? 0 : 2, 1, 2][s];
  }
  const VASHYA = [ // groom row, bride column
    [2, 1, 1, 0.5, 1],
    [1, 2, 0.5, 0, 1],
    [1, 0.5, 2, 1, 1],
    [0.5, 0, 1, 2, 0],
    [1, 1, 1, 0, 2],
  ];
  // 4. Yoni (4): animal of each Nakshatra and the friendship table.
  const YONI_OF = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
  const YONI = [ // Horse, Elephant, Sheep, Serpent, Dog, Cat, Rat, Cow, Buffalo, Tiger, Deer, Monkey, Mongoose, Lion
    [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 3, 3, 2, 1],
    [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
    [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
    [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
    [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
    [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
    [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
    [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
    [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
    [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
    [3, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
    [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
    [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
    [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
  ];
  // 5. Graha Maitri (5): lords of the Moon signs and natural friendship.
  const LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  const FRIENDS = {
    Sun: { f: ['Moon', 'Mars', 'Jupiter'], e: ['Venus', 'Saturn'] },
    Moon: { f: ['Sun', 'Mercury'], e: [] },
    Mars: { f: ['Sun', 'Moon', 'Jupiter'], e: ['Mercury'] },
    Mercury: { f: ['Sun', 'Venus'], e: ['Moon'] },
    Jupiter: { f: ['Sun', 'Moon', 'Mars'], e: ['Mercury', 'Venus'] },
    Venus: { f: ['Mercury', 'Saturn'], e: ['Sun', 'Moon'] },
    Saturn: { f: ['Mercury', 'Venus'], e: ['Sun', 'Moon', 'Mars'] },
  };
  const relation = (a, b) => FRIENDS[a].f.includes(b) ? 'f' : FRIENDS[a].e.includes(b) ? 'e' : 'n';
  const MAITRI = { ff: 5, fn: 4, nf: 4, nn: 3, fe: 1, ef: 1, ne: 0.5, en: 0.5, ee: 0 };
  // 6. Gana (6): 0 Deva, 1 Manushya, 2 Rakshasa.
  const GANA_OF = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
  const GANA = [[6, 6, 0], [5, 6, 0], [1, 0, 6]];  // groom row, bride column
  // 8. Nadi (8): 0 Adi, 1 Madhya, 2 Antya.
  const NADI_OF = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2];

  function taraPoints(from, to) {
    const count = ((to - from + 27) % 27) + 1;
    const tara = count % 9 || 9;
    return [3, 5, 7].includes(tara) ? 0 : 1.5;
  }

  /** Guna Milan for a couple from the sidereal Moon longitudes (degrees) of the groom and the bride. */
  function gunaMilan(groomMoon, brideMoon) {
    if (!Number.isFinite(groomMoon) || !Number.isFinite(brideMoon)) throw new Error('Moon longitudes required');
    const gs = sign(groomMoon), bs = sign(brideMoon), gn = nakshatra(groomMoon), bn = nakshatra(brideMoon);
    const gLord = LORD[gs], bLord = LORD[bs];
    const forward = ((gs - bs + 12) % 12) + 1, backward = ((bs - gs + 12) % 12) + 1;
    const bhakootBad = [[2, 12], [12, 2], [5, 9], [9, 5], [6, 8], [8, 6]].some(([a, b]) => a === forward && b === backward);
    const kootas = [
      { key: 'varna', max: 1, points: VARNA[gs] >= VARNA[bs] ? 1 : 0 },
      { key: 'vashya', max: 2, points: VASHYA[vashyaGroup(groomMoon)][vashyaGroup(brideMoon)] },
      { key: 'tara', max: 3, points: taraPoints(bn, gn) + taraPoints(gn, bn) },
      { key: 'yoni', max: 4, points: YONI[YONI_OF[gn]][YONI_OF[bn]] },
      { key: 'maitri', max: 5, points: gLord === bLord ? 5 : MAITRI[relation(gLord, bLord) + relation(bLord, gLord)] },
      { key: 'gana', max: 6, points: GANA[GANA_OF[gn]][GANA_OF[bn]] },
      { key: 'bhakoot', max: 7, points: bhakootBad ? 0 : 7 },
      { key: 'nadi', max: 8, points: NADI_OF[gn] === NADI_OF[bn] ? 0 : 8 },
    ];
    const total = kootas.reduce((sum, koota) => sum + koota.points, 0);
    const verdict = total >= 33 ? 'excellent' : total >= 25 ? 'good' : total >= 18 ? 'average' : 'low';
    return {
      total, max: 36, verdict, kootas,
      nadiDosha: kootas[7].points === 0, bhakootDosha: bhakootBad,
      groom: { rashi: gs + 1, nakshatra: gn + 1 }, bride: { rashi: bs + 1, nakshatra: bn + 1 },
    };
  }

  const api = { gunaMilan, tables: { YONI, VASHYA, GANA, YONI_OF, GANA_OF, NADI_OF } };
  root.matchUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
