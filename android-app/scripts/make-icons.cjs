// Draws the Jyotirmaya AstroChat logo (a gold zodiac wheel with a crescent moon on deep indigo) and writes every size:
// web icons, Android launcher icons (square, round, adaptive foreground), splash screens and the Play Store icon.
// Usage (from the repo root, needs Playwright's Chromium):  node android-app/scripts/make-icons.cjs [play-icon-output-dir]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const RES = path.join(ROOT, 'android-app', 'android', 'app', 'src', 'main', 'res');
const WEB = path.join(ROOT, 'src', 'jyotisha_ai', 'web', 'icons');
const GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const BG_COLOUR = '#1d1150';

const defs = `<defs>
<radialGradient id="bg" cx="0.5" cy="0.38" r="0.75"><stop offset="0" stop-color="#3b1f86"/><stop offset="0.6" stop-color="#1d1150"/><stop offset="1" stop-color="#0d0828"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#f2b33d"/><stop offset="1" stop-color="#d9822b"/></linearGradient>
<radialGradient id="sun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.55" stop-color="#ffc94d"/><stop offset="1" stop-color="#ff8a2a"/></radialGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0.3" stop-color="#ffcf5a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffcf5a" stop-opacity="0"/></radialGradient>
</defs>`;

const at = (r, a) => [256 + r * Math.cos(a), 256 + r * Math.sin(a)].map(v => v.toFixed(1));

// The wheel itself, centred on (256, 256) in a 512 box; its outer ring has a radius of 199.
function wheel() {
  let out = '<circle cx="256" cy="256" r="196" fill="none" stroke="url(#gold)" stroke-width="6"/>';
  for (let i = 0; i < 72; i += 1) {
    const a = i * Math.PI / 36, [x1, y1] = at(176, a), [x2, y2] = at(188, a);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="url(#gold)" stroke-width="3"/>`;
  }
  out += '<circle cx="256" cy="256" r="176" fill="none" stroke="url(#gold)" stroke-width="3"/>';
  for (let i = 0; i < 12; i += 1) {
    const a = -Math.PI / 2 + Math.PI / 12 + i * Math.PI / 6, [x1, y1] = at(104, a), [x2, y2] = at(176, a);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f2b33d" stroke-opacity=".45" stroke-width="2"/>`;
  }
  GLYPHS.forEach((glyph, i) => {
    const [x, y] = at(148, -Math.PI / 2 + i * Math.PI / 6);
    out += `<text x="${x}" y="${(Number(y) + 11).toFixed(1)}" font-size="30" text-anchor="middle" fill="#ffd36b" font-family="DejaVu Sans, Noto Sans Symbols, sans-serif">${glyph}</text>`;
  });
  out += '<circle cx="256" cy="256" r="104" fill="none" stroke="url(#gold)" stroke-width="4"/>';
  out += '<circle cx="256" cy="256" r="96" fill="url(#glow)"/><circle cx="256" cy="256" r="58" fill="url(#sun)"/>';
  out += '<path d="M286 226a40 40 0 1 0 0 60a32 32 0 1 1 0-60z" fill="#1d1150" opacity=".9"/>';
  return out;
}

function starsAround(count, seed) {
  let s = seed, out = '';
  const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < count; i += 1) {
    const x = 30 + rand() * 452, y = 30 + rand() * 452, r = 1.2 + rand() * 1.8, o = 0.4 + rand() * 0.5;
    if ((x - 256) ** 2 + (y - 256) ** 2 < 205 ** 2) continue;
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
  }
  return out;
}

// Full icon (square, background included). `scale` shrinks the wheel inside the box (for round masks and splash).
const fullIcon = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" fill="url(#bg)"/>${starsAround(40, 7)}<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${wheel()}</g></svg>`;
// Adaptive-icon foreground: transparent, wheel inside the 66dp safe circle of the 108dp layer.
const foreground = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<g transform="translate(256 256) scale(${(512 * 64 / 108 / 2) / 199}) translate(-256 -256)">${wheel()}</g></svg>`;
// Splash: the wheel in the middle of a deep indigo screen of any shape.
const splash = (w, h) => {
  const size = Math.min(w, h) * 0.42, s = size / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${defs}<radialGradient id="sbg" cx="0.5" cy="0.45" r="0.8"><stop offset="0" stop-color="#2b1870"/><stop offset="1" stop-color="#0d0828"/></radialGradient><rect width="${w}" height="${h}" fill="url(#sbg)"/><g transform="translate(${(w - size) / 2} ${(h - size) / 2}) scale(${s})">${wheel()}</g></svg>`;
};

async function render(page, svg, width, height, file, { round = false, radius = 0 } = {}) {
  const clip = round ? 'border-radius:50%;' : radius ? `border-radius:${radius}px;` : '';
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${width}px;height:${height}px;overflow:hidden;${clip}">${svg.replace('<svg ', `<svg width="${width}" height="${height}" `)}</div></body></html>`);
  await page.waitForTimeout(50);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  fs.writeFileSync(path.join(WEB, 'source.svg'), fullIcon());
  await render(page, fullIcon(), 512, 512, path.join(WEB, 'icon-512.png'));
  await render(page, fullIcon(), 192, 192, path.join(WEB, 'icon-192.png'));
  await render(page, fullIcon(), 180, 180, path.join(WEB, 'apple-touch-icon.png'));
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [name, d] of Object.entries(densities)) {
    const dir = path.join(RES, `mipmap-${name}`), icon = Math.round(48 * d), layer = Math.round(108 * d);
    await render(page, fullIcon(), icon, icon, path.join(dir, 'ic_launcher.png'), { radius: Math.round(icon * 0.18) });
    await render(page, fullIcon(1.04), icon, icon, path.join(dir, 'ic_launcher_round.png'), { round: true });
    await render(page, foreground(), layer, layer, path.join(dir, 'ic_launcher_foreground.png'));
  }
  const splashes = {
    'drawable': [480, 320], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
    'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280], 'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800],
    'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  };
  for (const [dir, [w, h]] of Object.entries(splashes)) await render(page, splash(w, h), w, h, path.join(RES, dir, 'splash.png'));
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG_COLOUR}</color>\n</resources>\n`);
  const playDir = process.argv[2];
  if (playDir) await render(page, fullIcon(), 512, 512, path.join(playDir, 'play-store-icon-512.png'));
  await browser.close();
  console.log('Icons written.');
})();
