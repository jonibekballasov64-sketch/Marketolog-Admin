// Reklama posti uchun rangli grafik (rasm) generatsiya qilish.
// @napi-rs/canvas — tashqi tizim shriftlariga tayangan bo'lmaydi (prebuilt binary),
// shuning uchun Railway'da ham ishonchli ishlaydi. Shriftlar @fontsource/inter'dan olinadi.

const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

const WIDTH = 1080;
const HEIGHT = 1080;

function registerFont(weight, family) {
  const dir = path.join(__dirname, 'node_modules/@fontsource/inter/files');
  const variants = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'];
  for (const v of variants) {
    try {
      GlobalFonts.registerFromPath(path.join(dir, `inter-${v}-${weight}-normal.woff`), family);
    } catch (e) {
      // ba'zi variant fayllari topilmasligi mumkin, davom etamiz
    }
  }
}

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  registerFont('900', 'InterBlack');
  registerFont('700', 'InterBold');
  registerFont('600', 'InterSemi');
  fontsReady = true;
}

// Kurs nomi/sarlavhaga qarab barqaror (doim bir xil) rang palitra tanlanadi,
// shunda bir xil kurs doim bir xil uslubda chiqadi.
const PALETTES = [
  { a: '#4338CA', b: '#7C3AED', accent: '#FBBF24', accentText: '#1E1B4B' }, // indigo -> binafsha, oltin
  { a: '#0F766E', b: '#059669', accent: '#FDE68A', accentText: '#064E3B' }, // teal -> zumrad
  { a: '#BE185D', b: '#DB2777', accent: '#FDE047', accentText: '#500724' }, // malina -> pushti
  { a: '#1D4ED8', b: '#0EA5E9', accent: '#F97316', accentText: '#0C4A6E' }, // ko'k -> osmon
  { a: '#9A3412', b: '#C2410C', accent: '#FDE68A', accentText: '#431407' }, // jigarrang -> apelsin
  { a: '#166534', b: '#16A34A', accent: '#FEF9C3', accentText: '#052E16' }, // qorong'u yashil
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickPalette(seed) {
  const h = hashString(seed || 'default');
  return PALETTES[h % PALETTES.length];
}

// Matnni berilgan maksimal kenglikka moslab qatorlarga bo'ladi.
function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Berilgan matn va maksimal qator soniga mos font o'lchamini topadi (katta -> kichik).
function fitFontSize(ctx, text, fontFamily, maxWidth, maxLines, startSize, minSize) {
  for (let size = startSize; size >= minSize; size -= 4) {
    ctx.font = `${size}px ${fontFamily}`;
    const lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { size, lines };
    }
  }
  ctx.font = `${minSize}px ${fontFamily}`;
  return { size: minSize, lines: wrapLines(ctx, text, maxWidth) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {{ headline: string, highlight?: string, eyebrow?: string, seed?: string }} opts
 * @returns {Buffer} PNG rasm
 */
function generateHeadlineImage({ headline, highlight, eyebrow, seed }) {
  ensureFonts();
  const palette = pickPalette(seed || headline);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // --- Fon gradienti ---
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, palette.a);
  grad.addColorStop(1, palette.b);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // --- Dekorativ shaffof doiralar (teksturasi) ---
  const h = hashString(seed || headline);
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#FFFFFF';
  const circles = [
    { x: WIDTH * 0.85, y: HEIGHT * 0.12, r: 220 },
    { x: WIDTH * 0.08, y: HEIGHT * 0.85, r: 260 },
    { x: WIDTH * 0.95, y: HEIGHT * 0.92, r: 150 },
  ];
  circles.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r + ((h >> (i * 4)) % 40), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  const paddingX = 90;
  const maxTextWidth = WIDTH - paddingX * 2;

  // --- Eyebrow (kichik label, masalan "TA'LIM KURSI") ---
  const eyebrowText = (eyebrow || "TA'LIM KURSI").toUpperCase();
  ctx.font = '600 34px InterSemi';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textBaseline = 'alphabetic';
  // harflar orasiga bo'shliq qo'shib "letter-spacing" effekti
  let ex = paddingX;
  const eyebrowY = 190;
  for (const ch of eyebrowText) {
    ctx.fillText(ch, ex, eyebrowY);
    ex += ctx.measureText(ch).width + 6;
  }

  // Eyebrow tagidagi chiziqcha
  ctx.fillStyle = palette.accent;
  ctx.fillRect(paddingX, eyebrowY + 24, 90, 8);

  // --- Sarlavha (headline) ---
  const headlineText = (headline || "KURSGA QO'SHILING").toUpperCase();
  const fit = fitFontSize(ctx, headlineText, 'InterBlack', maxTextWidth, 4, 112, 56);
  const lineHeight = fit.size * 1.12;
  const headlineStartY = 360;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${fit.size}px InterBlack`;
  // yumshoq soya
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  fit.lines.forEach((line, i) => {
    ctx.fillText(line, paddingX, headlineStartY + i * lineHeight);
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const headlineBottomY = headlineStartY + (fit.lines.length - 1) * lineHeight + 40;

  // --- Highlight pill (urg'u/chaqiriq) ---
  if (highlight) {
    const pillFontSize = 40;
    ctx.font = `600 ${pillFontSize}px InterSemi`;
    const textW = ctx.measureText(highlight).width;
    const pillPaddingX = 40;
    const pillH = 88;
    const pillW = Math.min(textW + pillPaddingX * 2, maxTextWidth);
    const pillY = Math.min(headlineBottomY + 30, HEIGHT - 260);

    ctx.fillStyle = palette.accent;
    roundRect(ctx, paddingX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();

    ctx.fillStyle = palette.accentText;
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${pillFontSize}px InterSemi`;
    ctx.fillText(highlight, paddingX + pillPaddingX, pillY + pillH / 2 + 2);
    ctx.textBaseline = 'alphabetic';
  }

  // --- Pastki qism: ingichka ajratuvchi chiziq + brend joy belgisi ---
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(paddingX, HEIGHT - 140, WIDTH - paddingX * 2, 2);
  ctx.globalAlpha = 1;

  return canvas.toBuffer('image/png');
}

module.exports = { generateHeadlineImage };
