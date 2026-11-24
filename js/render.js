// Rendert das Passfoto: Geometrie (Zuschnitt/Drehung/Zoom), Bildanpassungen, Hintergrund.
const pool = {};
function work(key, W, H) {
  let c = pool[key];
  if (!c) c = pool[key] = document.createElement('canvas');
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return c;
}

// t = { cx, cy, span, rot }: Quellpunkt in der Fotomitte, Quellpixel über die Fotohöhe, Drehung (rad)
export function applyGeom(ctx, img, imgScale, t, W, H) {
  const k = H / t.span;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  ctx.scale(k, k);
  ctx.rotate(t.rot);
  ctx.translate(-t.cx, -t.cy);
  ctx.scale(imgScale, imgScale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Für starke Verkleinerung: schrittweise halbieren (bessere Qualität in Safari).
// Die Stufen werden pro Quellbild einmal berechnet und wiederverwendet (flüssige Gesten).
const stepCache = new WeakMap();
function stepDown(src, targetScale) {
  let levels = stepCache.get(src);
  if (!levels) { levels = [{ img: src, scale: 1 }]; stepCache.set(src, levels); }
  let i = 0;
  while (targetScale / levels[i].scale < 0.5 && i < 6) {
    if (!levels[i + 1]) {
      const cur = levels[i].img;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(cur.width / 2)); c.height = Math.max(1, Math.round(cur.height / 2));
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(cur, 0, 0, c.width, c.height);
      levels[i + 1] = { img: c, scale: c.width / src.width };
    }
    i++;
  }
  return levels[i];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildLut(brightness, contrast) {
  const lut = new Uint8ClampedArray(256);
  const c = contrast * 1.28;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  for (let v = 0; v < 256; v++) lut[v] = f * (v + brightness * 1.2 - 128) + 128;
  return lut;
}

// Unscharf maskieren mit Radius relativ zur Bildhöhe:
// Vorschau und Export sehen dadurch gleich scharf aus.
function sharpen(img, amount) {
  const { width: W, height: H, data: d } = img;
  const r = Math.max(1, Math.round(H / 700));
  const n = W * H;
  const tmp = new Float32Array(n * 3), blur = new Float32Array(n * 3);
  const win = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += d[(y * W + Math.min(W - 1, Math.max(0, k))) * 4 + ch];
      for (let x = 0; x < W; x++) {
        tmp[(y * W + x) * 3 + ch] = acc / win;
        const xo = Math.max(0, x - r), xi = Math.min(W - 1, x + r + 1);
        acc += d[(y * W + xi) * 4 + ch] - d[(y * W + xo) * 4 + ch];
      }
    }
  }
  for (let x = 0; x < W; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(H - 1, Math.max(0, k)) * W + x) * 3 + ch];
      for (let y = 0; y < H; y++) {
        blur[(y * W + x) * 3 + ch] = acc / win;
        const yo = Math.max(0, y - r), yi = Math.min(H - 1, y + r + 1);
        acc += tmp[(yi * W + x) * 3 + ch] - tmp[(yo * W + x) * 3 + ch];
      }
    }
  }
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (d[i + 3] < 255) continue; // Bildrand: keine Säume
    for (let ch = 0; ch < 3; ch++) d[i + ch] = d[i + ch] + amount * (d[i + ch] - blur[p * 3 + ch]);
  }
}

/**
 * state: { src, mask, maskScale, t, adj, bg }
 * zeichnet in out (Canvas) mit W×H Pixeln
 */
export function renderPhoto(state, W, H, out) {
  const { src, mask, maskScale, t, adj, bg } = state;
  const A = work('a', W, H);
  const actx = A.getContext('2d', { willReadFrequently: true });
  const scale = H / t.span;
  const sd = stepDown(src, scale);
  applyGeom(actx, sd.img, 1 / sd.scale, t, W, H);

  let m = null;
  if (bg.replace && mask) {
    const M = work('m', W, H);
    const mctx = M.getContext('2d', { willReadFrequently: true });
    applyGeom(mctx, mask, maskScale, t, W, H);
    m = mctx.getImageData(0, 0, W, H).data;
  }
  const img = actx.getImageData(0, 0, W, H);
  if (adj.sharpen > 0) sharpen(img, adj.sharpen / 100 * 1.5);

  const d = img.data;
  const lut = buildLut(adj.brightness, adj.contrast);
  const sat = 1 + adj.saturation / 100;
  const warm = adj.warmth * 0.25;
  const gray = adj.gray;
  const [br, bgc, bb] = hexToRgb(bg.replace ? bg.color : '#ffffff');
  const f = Math.max(0.02, bg.feather);
  const lo = 0.5 - f / 2, hi = 0.5 + f / 2, span = hi - lo;

  for (let i = 0; i < d.length; i += 4) {
    let a = d[i + 3] / 255;
    if (a === 0) { d[i] = br; d[i + 1] = bgc; d[i + 2] = bb; d[i + 3] = 255; continue; }
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (warm) { r += warm; b -= warm; }
    r = lut[r < 0 ? 0 : r > 255 ? 255 : r | 0];
    g = lut[g];
    b = lut[b < 0 ? 0 : b > 255 ? 255 : b | 0];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (gray) { r = g = b = l; }
    else if (sat !== 1) { r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
    if (m) {
      let x = (m[i + 3] / 255 - lo) / span;
      x = x < 0 ? 0 : x > 1 ? 1 : x;
      a *= x * x * (3 - 2 * x);
    }
    d[i] = br + (r - br) * a;
    d[i + 1] = bgc + (g - bgc) * a;
    d[i + 2] = bb + (b - bb) * a;
    d[i + 3] = 255;
  }
  out.width = W; out.height = H;
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}
