/* Vector illustrations for the Home cards and feature pages: plum night sky, pink glow and gold lines.
   Each function returns an SVG string sized by CSS (it fills its box; the important part sits in the middle). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JyotishaArt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GOLD = '#e6c27a', GOLD2 = '#c99a52', PINK = '#ff5ec4', PINK2 = '#ff9ad8';
  const defs = id => `<defs>
    <radialGradient id="${id}-sky" cx="0.5" cy="0.35" r="0.85"><stop offset="0" stop-color="#5a1f6a"/><stop offset="0.55" stop-color="#2e0f3b"/><stop offset="1" stop-color="#170820"/></radialGradient>
    <radialGradient id="${id}-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PINK}" stop-opacity="0.55"/><stop offset="1" stop-color="${PINK}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-gold" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#fff3d1"/><stop offset="0.6" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD2}"/></radialGradient>
    <linearGradient id="${id}-pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3e6"/><stop offset="1" stop-color="#d43ba8"/></linearGradient>
  </defs>`;
  const stars = (seed, count = 18, w = 160, h = 120) => {
    let s = seed, out = '';
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < count; i += 1) out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(0.4 + r() * 1.1).toFixed(2)}" fill="#fff" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`;
    return out;
  };
  const sparkle = (x, y, size, fill = GOLD) => `<path d="M${x} ${y - size}C${x + size * 0.15} ${y - size * 0.15} ${x + size * 0.15} ${y - size * 0.15} ${x + size} ${y}C${x + size * 0.15} ${y + size * 0.15} ${x + size * 0.15} ${y + size * 0.15} ${x} ${y + size}C${x - size * 0.15} ${y + size * 0.15} ${x - size * 0.15} ${y + size * 0.15} ${x - size} ${y}C${x - size * 0.15} ${y - size * 0.15} ${x - size * 0.15} ${y - size * 0.15} ${x} ${y - size}Z" fill="${fill}"/>`;
  // Every drawing gets its own gradient ids: the same picture can be on the page twice (a Home card and a feature
  // page), and a second copy must not borrow gradients from a hidden first one (they would not paint).
  let drawings = 0;
  const frame = (id, body, seed, vb = '0 0 160 120') => {
    const uid = `${id}${drawings += 1}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs(id)}<rect width="100%" height="100%" fill="url(#${id}-sky)"/>${stars(seed)}${body}</svg>`;
    return svg.split(`id="${id}-`).join(`id="${uid}-`).split(`url(#${id}-`).join(`url(#${uid}-`);
  };
  const clouds = id => `<g fill="#7a2a7e" opacity="0.55"><ellipse cx="20" cy="118" rx="44" ry="14"/><ellipse cx="140" cy="120" rx="50" ry="15"/></g><g fill="#a03c8a" opacity="0.35"><ellipse cx="80" cy="124" rx="60" ry="12"/></g>`;

  // South Indian chart: a 4x4 square with the middle open, planets glowing in a few houses.
  function kundli() {
    const x0 = 50, y0 = 22, c = 15;
    let grid = `<circle cx="80" cy="52" r="46" fill="url(#k-glow)"/>`;
    grid += `<rect x="${x0}" y="${y0}" width="${c * 4}" height="${c * 4}" fill="#2a0f36" stroke="${GOLD}" stroke-width="1.4"/>`;
    for (let i = 1; i < 4; i += 1) {
      grid += `<line x1="${x0 + c * i}" y1="${y0}" x2="${x0 + c * i}" y2="${y0 + c}" stroke="${GOLD2}" stroke-width="0.8"/><line x1="${x0 + c * i}" y1="${y0 + c * 3}" x2="${x0 + c * i}" y2="${y0 + c * 4}" stroke="${GOLD2}" stroke-width="0.8"/>`;
      grid += `<line x1="${x0}" y1="${y0 + c * i}" x2="${x0 + c}" y2="${y0 + c * i}" stroke="${GOLD2}" stroke-width="0.8"/><line x1="${x0 + c * 3}" y1="${y0 + c * i}" x2="${x0 + c * 4}" y2="${y0 + c * i}" stroke="${GOLD2}" stroke-width="0.8"/>`;
    }
    grid += `<rect x="${x0 + c}" y="${y0 + c}" width="${c * 2}" height="${c * 2}" fill="#3a1648" stroke="${GOLD2}" stroke-width="0.8"/>`;
    grid += `<path d="M${x0 + c} ${y0 + c}L${x0 + c * 3} ${y0 + c * 3}M${x0 + c * 3} ${y0 + c}L${x0 + c} ${y0 + c * 3}" stroke="${GOLD2}" stroke-width="0.5" opacity="0.6"/>`;
    for (const [px, py, col] of [[x0 + 7, y0 + 8, '#ffd36b'], [x0 + 52, y0 + 9, '#ff8ad6'], [x0 + 8, y0 + 52, '#9fd0ff'], [x0 + 53, y0 + 37, '#ff7a5c'], [x0 + 37, y0 + 53, '#c9a6ff']]) grid += `<circle cx="${px}" cy="${py}" r="3.2" fill="${col}"/><circle cx="${px}" cy="${py}" r="6" fill="${col}" opacity="0.18"/>`;
    grid += sparkle(x0 + 30, y0 + 30, 8, '#fff3d1');
    for (const [px, py, r, col] of [[22, 30, 7, '#ff9a6b'], [140, 26, 9, '#d9a6ff'], [134, 92, 6, '#ffd36b'], [24, 90, 5, '#9fd0ff']]) grid += `<circle cx="${px}" cy="${py}" r="${r}" fill="${col}" opacity="0.85"/><circle cx="${px}" cy="${py}" r="${r + 5}" fill="${col}" opacity="0.15"/>`;
    return frame('k', grid + clouds('k'), 3);
  }
  // Zodiac wheel with a sun and moon in the centre.
  function rashi() {
    const glyphs = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
    let w = `<circle cx="104" cy="58" r="52" fill="url(#r-glow)"/><circle cx="104" cy="58" r="44" fill="none" stroke="${GOLD}" stroke-width="1.4"/><circle cx="104" cy="58" r="33" fill="none" stroke="${GOLD2}" stroke-width="0.9"/><circle cx="104" cy="58" r="18" fill="none" stroke="${GOLD2}" stroke-width="0.9"/>`;
    glyphs.forEach((g, i) => {
      const a = -Math.PI / 2 + i * Math.PI / 6;
      w += `<text x="${(104 + 38.5 * Math.cos(a)).toFixed(1)}" y="${(58 + 38.5 * Math.sin(a) + 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="${GOLD}" font-family="DejaVu Sans, sans-serif">${g}</text>`;
      const b = a + Math.PI / 12;
      w += `<line x1="${(104 + 18 * Math.cos(b)).toFixed(1)}" y1="${(58 + 18 * Math.sin(b)).toFixed(1)}" x2="${(104 + 33 * Math.cos(b)).toFixed(1)}" y2="${(58 + 33 * Math.sin(b)).toFixed(1)}" stroke="${GOLD2}" stroke-width="0.5" opacity="0.6"/>`;
    });
    w += `<circle cx="104" cy="58" r="11" fill="url(#r-gold)"/><path d="M108 50a9 9 0 1 0 0 16a7 7 0 1 1 0-16z" fill="#2e0f3b"/>`;
    w += sparkle(28, 30, 6) + sparkle(40, 74, 4, PINK2);
    w += `<path d="M14 40l10 6 8-12 12 8" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.6"/>`;
    return frame('r', w + clouds('r'), 7);
  }
  // Two gold rings tied by a glowing pink thread with a heart.
  function match() {
    let m = `<circle cx="80" cy="56" r="46" fill="url(#m-glow)"/>`;
    m += `<circle cx="60" cy="60" r="18" fill="none" stroke="url(#m-gold)" stroke-width="5"/><circle cx="96" cy="60" r="18" fill="none" stroke="url(#m-gold)" stroke-width="5"/>`;
    m += `<path d="M60 42C70 26 90 26 98 42" fill="none" stroke="${PINK}" stroke-width="1.4" stroke-dasharray="2 2"/>`;
    m += `<path d="M79 26c-3-6-12-4-11 3 1 5 11 10 11 10s10-5 11-10c1-7-8-9-11-3z" fill="url(#m-pink)"/>`;
    m += `<circle cx="96" cy="42" r="4" fill="#fff3d1"/>` + sparkle(124, 30, 6) + sparkle(30, 34, 5, PINK2) + sparkle(130, 86, 4);
    m += `<path d="M10 104q40-18 70-6t70-8" fill="none" stroke="${GOLD2}" stroke-width="0.6" opacity="0.5"/>`;
    return frame('m', m + clouds('m'), 11);
  }
  // A lit diya on a little rangoli.
  function festivals() {
    let f = `<circle cx="80" cy="54" r="48" fill="url(#f-glow)"/>`;
    for (let i = 0; i < 12; i += 1) { const a = i * Math.PI / 6; f += `<circle cx="${(80 + 34 * Math.cos(a)).toFixed(1)}" cy="${(84 + 12 * Math.sin(a)).toFixed(1)}" r="2" fill="${i % 2 ? PINK2 : GOLD}"/>`; }
    f += `<ellipse cx="80" cy="84" rx="26" ry="8" fill="none" stroke="${GOLD2}" stroke-width="0.8" stroke-dasharray="2 3"/>`;
    f += `<path d="M58 72q22 18 44 0l-4 8q-18 10-36 0z" fill="url(#f-gold)"/><path d="M58 72q22 10 44 0" fill="none" stroke="#8a4a1a" stroke-width="0.8"/>`;
    f += `<path d="M80 40c6 10 8 18 0 28c-8-10-6-18 0-28z" fill="#ffcf5a"/><path d="M80 50c3 6 4 10 0 16c-4-6-3-10 0-16z" fill="#fff6d8"/>`;
    f += `<circle cx="80" cy="56" r="20" fill="#ffcf5a" opacity="0.18"/>` + sparkle(30, 30, 6) + sparkle(130, 36, 7, PINK2) + sparkle(120, 90, 4);
    return frame('f', f + clouds('f'), 19);
  }
  // An hourglass with planets orbiting: the planetary periods.
  function dasha() {
    let d = `<circle cx="80" cy="58" r="46" fill="url(#d-glow)"/><ellipse cx="80" cy="58" rx="56" ry="18" fill="none" stroke="${GOLD2}" stroke-width="0.7" opacity="0.7"/>`;
    d += `<rect x="62" y="26" width="36" height="5" rx="2" fill="url(#d-gold)"/><rect x="62" y="86" width="36" height="5" rx="2" fill="url(#d-gold)"/>`;
    d += `<path d="M66 31h28c0 16-11 20-11 27s11 11 11 28H66c0-17 11-21 11-28s-11-11-11-27z" fill="#3a1648" stroke="${GOLD}" stroke-width="1.2"/>`;
    d += `<path d="M70 36h20c-2 8-8 12-10 16c-2-4-8-8-10-16z" fill="${PINK2}" opacity="0.85"/><path d="M68 84c4-8 9-10 12-10s8 2 12 10z" fill="${PINK2}" opacity="0.85"/>`;
    for (const [x, y, r, c] of [[26, 52, 6, '#ff9a6b'], [134, 62, 7, '#9fd0ff'], [118, 44, 4, '#ffd36b'], [42, 70, 4, '#d9a6ff']]) d += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
    return frame('d', d + sparkle(132, 24, 5) + clouds('d'), 23);
  }
  // Mars (red) and Saturn with rings: Kuja dosha and Sade Sati.
  function doshas() {
    let o = `<circle cx="80" cy="56" r="48" fill="url(#o-glow)"/>`;
    o += `<circle cx="58" cy="54" r="20" fill="#e2563c"/><circle cx="52" cy="48" r="6" fill="#f08a6a" opacity="0.6"/><circle cx="64" cy="62" r="4" fill="#b23a28" opacity="0.7"/>`;
    o += `<ellipse cx="106" cy="66" rx="30" ry="8" fill="none" stroke="${GOLD}" stroke-width="2.4" transform="rotate(-18 106 66)"/><circle cx="106" cy="66" r="16" fill="#d9b57a"/><path d="M92 62h28M93 70h26" stroke="#b08850" stroke-width="2" opacity="0.6"/>`;
    return frame('o', o + sparkle(26, 30, 5) + sparkle(138, 26, 6, PINK2) + clouds('o'), 29);
  }
  // A big pink moon with a constellation drawn on it.
  function moon() {
    let n = `<circle cx="80" cy="56" r="52" fill="url(#n-glow)"/><circle cx="80" cy="56" r="34" fill="url(#n-pink)"/>`;
    n += `<circle cx="70" cy="46" r="6" fill="#fff" opacity="0.18"/><circle cx="92" cy="66" r="8" fill="#fff" opacity="0.12"/><circle cx="76" cy="72" r="4" fill="#fff" opacity="0.15"/>`;
    n += `<path d="M58 60L70 50L82 54L92 42L104 46" fill="none" stroke="#fff" stroke-width="0.9" opacity="0.85"/>`;
    for (const [x, y] of [[58, 60], [70, 50], [82, 54], [92, 42], [104, 46]]) n += `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`;
    n += `<ellipse cx="80" cy="92" rx="54" ry="9" fill="#c86aa8" opacity="0.35"/>`;
    return frame('n', n + sparkle(28, 26, 6) + sparkle(134, 30, 5, PINK2) + clouds('n'), 31);
  }
  // Three tarot cards fanned out, with a candle.
  function tarot() {
    const card = (x, rot, sym) => `<g transform="rotate(${rot} ${x + 14} 82)"><rect x="${x}" y="30" width="28" height="48" rx="3" fill="#2e0f3b" stroke="${GOLD}" stroke-width="1.3"/><rect x="${x + 3}" y="33" width="22" height="42" rx="2" fill="none" stroke="${GOLD2}" stroke-width="0.6"/>${sym(x + 14, 54)}</g>`;
    const sun = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="url(#t-gold)"/>` + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="${(x + 7 * Math.cos(a)).toFixed(1)}" y1="${(y + 7 * Math.sin(a)).toFixed(1)}" x2="${(x + 10 * Math.cos(a)).toFixed(1)}" y2="${(y + 10 * Math.sin(a)).toFixed(1)}" stroke="${GOLD}" stroke-width="1"/>`; }).join('');
    const crescent = (x, y) => `<path d="M${x + 3} ${y - 7}a8 8 0 1 0 0 14a6 6 0 1 1 0-14z" fill="${GOLD}"/>`;
    const star = (x, y) => sparkle(x, y, 7, GOLD);
    let t = `<circle cx="80" cy="56" r="50" fill="url(#t-glow)"/>` + card(42, -14, crescent) + card(66, 0, sun) + card(90, 14, star);
    t += `<rect x="20" y="70" width="10" height="22" rx="2" fill="#f6e7d0"/><path d="M25 58c3 5 4 8 0 12c-4-4-3-7 0-12z" fill="#ffcf5a"/><circle cx="25" cy="66" r="10" fill="#ffcf5a" opacity="0.18"/>`;
    t += `<path d="M126 92l6-8 6 8-6 6z" fill="#b48cff" opacity="0.8"/>`;
    return frame('t', t + sparkle(138, 26, 5) + clouds('t'), 37);
  }
  // An open palm with glowing pink lines and a crescent.
  function palm() {
    let p = `<circle cx="78" cy="58" r="50" fill="url(#p-glow)"/>`;
    p += `<path d="M58 104c-6-10-12-22-12-34 0-6 6-8 9-2l5 10V30c0-6 9-6 9 0v26V24c0-6 9-6 9 0v32V28c0-6 9-6 9 0v30V36c0-6 9-6 9 0v40c0 14-6 22-12 28z" fill="#f2c7a8" stroke="#e8a888" stroke-width="0.8"/>`;
    p += `<path d="M66 76c8-4 18-4 26 2" fill="none" stroke="${PINK}" stroke-width="1.6"/><path d="M64 86c10-2 18 0 26 6" fill="none" stroke="${PINK}" stroke-width="1.6"/><path d="M70 98c0-10 4-18 12-22" fill="none" stroke="${PINK}" stroke-width="1.6"/>`;
    p += `<path d="M118 22a14 14 0 1 0 0 26a11 11 0 1 1 0-26z" fill="${GOLD}"/>` + sparkle(32, 32, 6) + sparkle(130, 80, 5, PINK2);
    return frame('p', p + clouds('p'), 41);
  }
  // A crystal ball on a gold stand: the AI astrologer.
  function orb() {
    let b = `<circle cx="80" cy="54" r="50" fill="url(#b-glow)"/><circle cx="80" cy="52" r="30" fill="url(#b-pink)" opacity="0.9"/>`;
    b += `<circle cx="80" cy="52" r="30" fill="none" stroke="#ffd6f1" stroke-width="1.2"/><path d="M66 44q8-10 18-6" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>`;
    b += sparkle(84, 54, 8, '#fff3d1') + `<path d="M62 82h36l-6 10H68z" fill="url(#b-gold)"/><rect x="58" y="92" width="44" height="5" rx="2" fill="${GOLD2}"/>`;
    return frame('b', b + sparkle(30, 30, 5) + sparkle(130, 28, 6, PINK2), 43);
  }
  // The sun rising beside a crescent moon: the day's Panchang.
  function panchang() {
    let g = `<circle cx="80" cy="60" r="50" fill="url(#g-glow)"/>`;
    for (let i = 0; i < 12; i += 1) { const a = Math.PI + i * Math.PI / 11; g += `<line x1="${(66 + 24 * Math.cos(a)).toFixed(1)}" y1="${(78 + 24 * Math.sin(a)).toFixed(1)}" x2="${(66 + 34 * Math.cos(a)).toFixed(1)}" y2="${(78 + 34 * Math.sin(a)).toFixed(1)}" stroke="${GOLD}" stroke-width="1.6"/>`; }
    g += `<path d="M44 78a22 22 0 0 1 44 0z" fill="url(#g-gold)"/><line x1="20" y1="78" x2="140" y2="78" stroke="${GOLD2}" stroke-width="1"/>`;
    g += `<path d="M118 28a14 14 0 1 0 0 26a11 11 0 1 1 0-26z" fill="#fff3d1"/>` + sparkle(100, 30, 4) + sparkle(138, 64, 4, PINK2);
    return frame('g', g + clouds('g'), 47);
  }
  // ---- Tarot cards (portrait 100 x 160): a patterned back, and a face per Major Arcana card with its own emblem ----
  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
  const sun = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#c-gold)"/>` + Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<line x1="${(x + (r + 3) * Math.cos(a)).toFixed(1)}" y1="${(y + (r + 3) * Math.sin(a)).toFixed(1)}" x2="${(x + (r + 8) * Math.cos(a)).toFixed(1)}" y2="${(y + (r + 8) * Math.sin(a)).toFixed(1)}" stroke="${GOLD}" stroke-width="1.6"/>`; }).join('');
  const crescent = (x, y, r, fill = GOLD) => `<path d="M${x + r * 0.3} ${y - r * 0.85}a${r} ${r} 0 1 0 0 ${1.7 * r}a${r * 0.78} ${r * 0.78} 0 1 1 0-${1.7 * r}z" fill="${fill}"/>`;
  const heart = (x, y, r) => `<path d="M${x} ${y + r}c-${r * 1.6}-${r} -${r * 1.4}-${r * 2.2} 0-${r * 1.3}c${r * 1.4}-${r * 0.9} ${r * 1.6} ${r * 0.3} 0 ${r * 1.3}z" fill="url(#c-pink)"/>`;
  const EMBLEMS = [
    () => sun(50, 70, 12) + `<path d="M30 112q20-18 40 0" fill="none" stroke="${PINK2}" stroke-width="1.6"/>`,            // Fool
    () => `<path d="M30 76c10-14 20-14 20 0s10 14 20 0-10-14-20 0-10 14-20 0z" fill="none" stroke="${GOLD}" stroke-width="2.4"/>` + sparkle(50, 100, 7),   // Magician: infinity
    () => `<rect x="30" y="52" width="8" height="56" fill="#2e0f3b" stroke="${GOLD}"/><rect x="62" y="52" width="8" height="56" fill="#f6e7d0" stroke="${GOLD}"/>` + crescent(50, 78, 9),   // High Priestess
    () => `<path d="M50 54c8 10 8 22 0 30c-8-8-8-20 0-30z" fill="${GOLD}"/><path d="M50 84c10 6 16 14 16 24H34c0-10 6-18 16-24z" fill="url(#c-pink)"/>` + sparkle(50, 46, 5),   // Empress
    () => `<path d="M32 104V70l18-14 18 14v34z" fill="#2e0f3b" stroke="${GOLD}" stroke-width="1.8"/><path d="M40 70l10-8 10 8" fill="none" stroke="${GOLD}" stroke-width="1.6"/>` + sparkle(50, 86, 6),   // Emperor
    () => `<path d="M42 60h16v40H42z" fill="none" stroke="${GOLD}" stroke-width="1.6"/><path d="M38 70h24M38 84h24" stroke="${GOLD}" stroke-width="1.6"/><circle cx="50" cy="52" r="5" fill="${GOLD}"/>`,   // Hierophant: keys/cross
    () => heart(42, 68, 9) + heart(58, 68, 9) + sparkle(50, 98, 7, PINK2),   // Lovers
    () => `<circle cx="50" cy="80" r="20" fill="none" stroke="${GOLD}" stroke-width="2.2"/>` + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<line x1="50" y1="80" x2="${(50 + 20 * Math.cos(a)).toFixed(1)}" y2="${(80 + 20 * Math.sin(a)).toFixed(1)}" stroke="${GOLD2}" stroke-width="1.2"/>`; }).join(''),   // Chariot: wheel
    () => `<path d="M30 92c0-18 10-30 20-30s20 12 20 30c-6-6-14-8-20-8s-14 2-20 8z" fill="url(#c-gold)"/><path d="M40 76q10 6 20 0" fill="none" stroke="#8a4a1a" stroke-width="1.2"/>` + heart(50, 104, 5),   // Strength
    () => `<path d="M44 60h12l4 10H40z" fill="${GOLD}"/><rect x="42" y="70" width="16" height="22" rx="2" fill="#2e0f3b" stroke="${GOLD}"/>` + sparkle(50, 81, 6, '#fff3d1') + `<line x1="50" y1="92" x2="50" y2="112" stroke="${GOLD}" stroke-width="1.6"/>`,   // Hermit: lamp
    () => `<circle cx="50" cy="80" r="22" fill="none" stroke="${GOLD}" stroke-width="2"/><circle cx="50" cy="80" r="12" fill="none" stroke="${PINK2}" stroke-width="1.4"/>` + Array.from({ length: 4 }, (_, i) => { const a = i * Math.PI / 2 + Math.PI / 4; return sparkle(+(50 + 22 * Math.cos(a)).toFixed(1), +(80 + 22 * Math.sin(a)).toFixed(1), 4); }).join(''),   // Wheel
    () => `<line x1="50" y1="56" x2="50" y2="108" stroke="${GOLD}" stroke-width="2"/><line x1="30" y1="66" x2="70" y2="66" stroke="${GOLD}" stroke-width="2"/><path d="M24 86l6-20 6 20zM64 86l6-20 6 20z" fill="url(#c-gold)"/>`,   // Justice: scales
    () => `<path d="M50 56v34" stroke="${GOLD}" stroke-width="1.6"/><path d="M50 90c-10 0-14 10-10 18c4-4 6-6 10-6s6 2 10 6c4-8 0-18-10-18z" fill="url(#c-pink)"/>` + sparkle(50, 52, 5),   // Hanged Man: pendulum
    () => `<path d="M50 80c-14-18-30-10-24 4 4 10 20 8 24-4zM50 80c14-18 30-10 24 4-4 10-20 8-24-4z" fill="url(#c-pink)"/><path d="M50 72v24" stroke="${GOLD}" stroke-width="1.6"/>`,   // Death: butterfly of change
    () => `<path d="M38 60h10v14H38zM52 86h10v14H52z" fill="none" stroke="${GOLD}" stroke-width="1.6"/><path d="M48 70q10 8 6 18" fill="none" stroke="${PINK2}" stroke-width="1.6"/>` + sparkle(50, 108, 5),   // Temperance: two cups
    () => `<circle cx="40" cy="80" r="8" fill="none" stroke="${GOLD}" stroke-width="2"/><circle cx="54" cy="80" r="8" fill="none" stroke="${GOLD}" stroke-width="2"/><circle cx="68" cy="80" r="8" fill="none" stroke="${GOLD}" stroke-width="2"/>`,   // Devil: chain links
    () => `<path d="M38 112V64l12-10 12 10v48z" fill="#2e0f3b" stroke="${GOLD}" stroke-width="1.6"/><path d="M58 50l-8 14h8l-10 16" fill="none" stroke="#ffd36b" stroke-width="2"/>`,   // Tower
    () => sparkle(50, 72, 16, '#fff3d1') + sparkle(30, 100, 5) + sparkle(70, 100, 5) + sparkle(50, 108, 4, PINK2),   // Star
    () => `<circle cx="50" cy="74" r="18" fill="url(#c-pink)"/>` + crescent(52, 74, 12, '#2e0f3b') + `<path d="M30 108q20-10 40 0" fill="none" stroke="${GOLD2}" stroke-width="1.4"/>`,   // Moon
    () => sun(50, 78, 16),   // Sun
    () => `<path d="M40 60l20-6v14l-20 6z" fill="url(#c-gold)"/><path d="M60 54l10-4v22l-10-4" fill="${GOLD}"/>` + sparkle(44, 98, 6, PINK2) + sparkle(62, 104, 4),   // Judgement: trumpet
    () => `<ellipse cx="50" cy="80" rx="20" ry="28" fill="none" stroke="${GOLD}" stroke-width="2.4"/><ellipse cx="50" cy="80" rx="14" ry="22" fill="none" stroke="${PINK2}" stroke-width="1"/>` + sparkle(50, 80, 8, '#fff3d1'),   // World: wreath
  ];
  const cardDefs = () => `<defs><linearGradient id="c-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1a58"/><stop offset="1" stop-color="#1d0a27"/></linearGradient>
    <radialGradient id="c-gold" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#fff3d1"/><stop offset="0.6" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD2}"/></radialGradient>
    <linearGradient id="c-pink" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3e6"/><stop offset="1" stop-color="#d43ba8"/></linearGradient>
    <radialGradient id="c-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PINK}" stop-opacity="0.45"/><stop offset="1" stop-color="${PINK}" stop-opacity="0"/></radialGradient></defs>`;
  const cardFrame = body => {
    const uid = `c${drawings += 1}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 160" aria-hidden="true">${cardDefs()}<rect x="1" y="1" width="98" height="158" rx="8" fill="url(#c-bg)" stroke="${GOLD}" stroke-width="2"/><rect x="6" y="6" width="88" height="148" rx="5" fill="none" stroke="${GOLD2}" stroke-width="0.8"/>${body}</svg>`;
    return svg.split('id="c-').join(`id="${uid}-`).split('url(#c-').join(`url(#${uid}-`);
  };
  function tarotBack() {
    let b = `<circle cx="50" cy="80" r="34" fill="url(#c-glow)"/><circle cx="50" cy="80" r="26" fill="none" stroke="${GOLD}" stroke-width="1.2"/><circle cx="50" cy="80" r="18" fill="none" stroke="${GOLD2}" stroke-width="0.8"/>`;
    b += crescent(46, 80, 9) + sparkle(58, 72, 4, '#fff3d1');
    for (const [x, y] of [[20, 22], [80, 22], [20, 138], [80, 138]]) b += sparkle(x, y, 5);
    for (let i = 0; i < 12; i += 1) { const a = i * Math.PI / 6; b += `<circle cx="${(50 + 32 * Math.cos(a)).toFixed(1)}" cy="${(80 + 32 * Math.sin(a)).toFixed(1)}" r="1.4" fill="${GOLD}"/>`; }
    return cardFrame(b);
  }
  function tarotCard(index) {
    const emblem = EMBLEMS[index] || EMBLEMS[0];
    return cardFrame(`<circle cx="50" cy="80" r="30" fill="url(#c-glow)"/><text x="50" y="26" font-size="12" text-anchor="middle" fill="${GOLD}" font-family="Georgia, serif">${ROMAN[index] || ''}</text>${emblem()}`);
  }
  return { kundli, rashi, match, festivals, dasha, doshas, moon, tarot, palm, orb, panchang, tarotBack, tarotCard };
});
