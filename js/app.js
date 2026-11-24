import { FORMATS, PAPERS, BG_COLORS, mmToPx } from './formats.js';
import { t, getLang, setLang, applyI18n, RULES } from './i18n.js';
import { initVision, initSegmenter, initVideo, detectFaces, detectVideo, segmentPerson } from './vision.js';
import { renderPhoto } from './render.js';
import { jpegWithDpi, makePdf, renderSheet, sheetLayout, downloadBlob, shareBlob, printAtSize, canvasToBlob } from './export.js';
import { addEntry, listEntries, removeEntry } from './db.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const DEFAULT_ADJ = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 20, gray: false };
const S = {
  format: null,
  src: null, small: null, smallScale: 1,
  faces: [], face: null, light: null, bgStat: null, aiOk: false,
  mask: null, maskScale: 1, maskData: null,
  t: { cx: 0, cy: 0, span: 1, rot: 0 }, autoSpan: 1, autoRot: 0,
  adj: { ...DEFAULT_ADJ },
  bg: { replace: false, color: '#ffffff', feather: 0.3 },
  guides: true,
  photo: null, photoFmt: null,
  ex: { dpi: 600, paper: '10x15', gap: 0, count: 0, cut: true },
  facing: 'user', timer: 0, auto: false,
};

// ---------- Hilfen ----------
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function busy(msg) { $('#busy').hidden = !msg; if (msg) $('#busyText').textContent = msg; }
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtName = f => f.name[getLang()] || f.name.de;
const fmtSize = f => `${+f.w.toFixed(1)} × ${+f.h.toFixed(1)} mm`;

// ---------- Navigation ----------
const stack = ['home'];
function show(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
  $('#btnBack').hidden = name === 'home';
  document.querySelector('.topbar').hidden = name === 'camera';
  $('#btnInstall').classList.toggle('offscreen', name !== 'home');
  window.scrollTo(0, 0);
  if (name === 'editor') requestAnimationFrame(layoutPreview);
  if (name === 'history') renderHistory();
}
function go(name, { replace = false } = {}) {
  if (replace) { stack[stack.length - 1] = name; history.replaceState({ s: name }, ''); }
  else { stack.push(name); history.pushState({ s: name }, ''); }
  show(name);
}
window.addEventListener('popstate', e => {
  const target = e.state?.s || 'home';
  while (stack.length > 1 && stack[stack.length - 1] !== target) {
    const leaving = stack.pop();
    if (leaving === 'camera') stopCamera();
  }
  show(stack[stack.length - 1]);
});
$('#btnBack').onclick = () => history.back();

// ---------- Formate ----------
function loadCustom() {
  try { return JSON.parse(localStorage.getItem('pf-custom')) || null; } catch { return null; }
}
function renderFormats() {
  const list = $('#formatList');
  list.innerHTML = '';
  FORMATS.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'format' + (i === 0 ? ' featured' : '') + (S.format?.id === f.id ? ' selected' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', S.format?.id === f.id);
    const sc = 30 / Math.max(f.w, f.h);
    b.innerHTML = `<span class="shape"><i style="width:${f.w * sc}px;height:${f.h * sc}px"></i></span>
      <span><div class="fname"></div><div class="fsize">${f.custom ? '' : fmtSize(f)}</div></span><span class="flag">${f.flag}</span>`;
    b.querySelector('.fname').textContent = fmtName(f);
    b.onclick = () => selectFormat(f.id);
    list.appendChild(b);
  });
}
function selectFormat(id) {
  const base = FORMATS.find(f => f.id === id) || FORMATS[0];
  let f = { ...base };
  if (f.custom) {
    const c = loadCustom();
    if (c) Object.assign(f, c);
    $('#cW').value = f.w; $('#cH').value = f.h; $('#cHead').value = Math.round(f.target * 100);
  }
  S.format = f;
  localStorage.setItem('pf-format', id);
  $('#customBox').hidden = !f.custom;
  renderFormats();
  renderRules();
}
function updateCustom() {
  const w = clamp(+$('#cW').value || 50, 10, 200), h = clamp(+$('#cH').value || 60, 10, 200);
  const head = clamp((+$('#cHead').value || 75) / 100, 0.3, 0.9);
  const c = { w, h, target: head, head: [head - 0.05, head + 0.05], top: clamp((1 - head) * 0.4, 0.03, 0.3) };
  localStorage.setItem('pf-custom', JSON.stringify(c));
  Object.assign(S.format, c);
}
['#cW', '#cH', '#cHead'].forEach(s => $(s).addEventListener('change', updateCustom));
function renderRules() {
  const ul = $('#rulesList'); ul.innerHTML = '';
  const f = S.format;
  const items = [...RULES[f.rules][getLang()]];
  if (f.rules !== 'tr') items.unshift(`${fmtSize(f)} · ${Math.round(f.head[0] * f.h)}–${Math.round(f.head[1] * f.h)} mm`);
  items.forEach(s => { const li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
}

// ---------- Bild laden ----------
function toCanvas(drawable, w, h, max) {
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(drawable, 0, 0, c.width, c.height);
  return c;
}
async function loadFile(file) {
  if (!file) return;
  busy(t('analyzing'));
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    setSource(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(url);
    await analyze();
    if (stack[stack.length - 1] === 'camera') { stopCamera(); go('editor', { replace: true }); }
    else go('editor');
  } catch (e) {
    console.error(e); busy(null); toast(e.message || String(e));
  }
}
function setSource(drawable, w, h) {
  S.src = toCanvas(drawable, w, h, 3200);
  S.small = toCanvas(S.src, S.src.width, S.src.height, 1024);
  S.smallScale = S.src.width / S.small.width;
}
$('#fileInput').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };
$('#fileInput2').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };

// ---------- Analyse ----------
async function analyze() {
  Object.assign(S, { faces: [], face: null, mask: null, maskData: null, light: null, bgStat: null, aiOk: false });
  S.adj = { ...DEFAULT_ADJ };
  try {
    busy(t('loadingAI')); await nextFrame();
    await initVision();
    busy(t('analyzing')); await nextFrame();
    S.faces = detectFaces(S.small);
    S.aiOk = true;
  } catch (e) { console.error(e); toast(t('aiFail')); }

  if (S.faces.length) {
    const big = S.faces.map(f => ({ f, size: faceSize(f.landmarks) })).sort((a, b) => b.size - a.size)[0].f;
    S.face = computeFace(big);
  } else if (S.aiOk) toast(t('noFace'), 3500);

  if (S.aiOk) {
    try {
      busy(t('removingBg')); await nextFrame();
      await initSegmenter();
      S.mask = segmentPerson(S.small);
      S.maskScale = S.src.width / S.mask.width;
      S.maskData = S.mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, S.mask.width, S.mask.height).data;
    } catch (e) { console.error(e); S.mask = null; }
  }
  if (S.face) { refineCrown(); measureLight(); }
  measureBackground();
  S.bg.replace = !!S.mask;
  S.bg.color = S.format.bg;
  autoFit();
  busy(null);
  syncControls();
}

function faceSize(lm) {
  let minX = 1, maxX = 0;
  for (const p of lm) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); }
  return maxX - minX;
}

function computeFace({ landmarks: lm, blend }) {
  const W = S.src.width, H = S.src.height;
  const P = i => ({ x: lm[i].x * W, y: lm[i].y * H });
  const avg = (...ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
  let e1 = lm.length > 473 ? P(468) : avg(P(33), P(133));
  let e2 = lm.length > 473 ? P(473) : avg(P(362), P(263));
  if (e1.x > e2.x) [e1, e2] = [e2, e1];
  const angle = Math.atan2(e2.y - e1.y, e2.x - e1.x);
  const u = { x: Math.cos(angle), y: Math.sin(angle) }, v = { x: -Math.sin(angle), y: Math.cos(angle) };
  const eyeMid = avg(e1, e2);
  const forehead = P(10), chin = P(152);
  let left = P(234), right = P(454);
  if (left.x > right.x) [left, right] = [right, left];
  const nose = P(1);
  const L = (chin.x - forehead.x) * v.x + (chin.y - forehead.y) * v.y;
  const crown = { x: forehead.x - v.x * 0.3 * L, y: forehead.y - v.y * 0.3 * L };
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (const p of lm) { minX = Math.min(minX, p.x * W); maxX = Math.max(maxX, p.x * W); minY = Math.min(minY, p.y * H); maxY = Math.max(maxY, p.y * H); }
  return { e1, e2, eyeMid, angle, u, v, forehead, chin, left, right, nose, crown, L, blend, box: { minX, minY, maxX, maxY } };
}

// Scheitel mit Hilfe der Personenmaske finden (Oberkante Kopf inkl. Haaransatz)
function refineCrown() {
  const f = S.face;
  if (!S.maskData) return;
  const mw = S.mask.width, mh = S.mask.height, ms = S.maskScale, md = S.maskData;
  const alpha = (x, y) => {
    const xi = Math.round(x / ms), yi = Math.round(y / ms);
    if (xi < 0 || yi < 0 || xi >= mw || yi >= mh) return 0;
    return md[(yi * mw + xi) * 4 + 3] / 255;
  };
  const faceW = Math.hypot(f.right.x - f.left.x, f.right.y - f.left.y);
  let best = 0;
  for (const o of [-0.2, -0.1, 0, 0.1, 0.2]) {
    const sx = f.forehead.x + f.u.x * o * faceW, sy = f.forehead.y + f.u.y * o * faceW;
    for (let d = 0; d < 0.8 * f.L; d += Math.max(1, ms * 0.5)) {
      if (alpha(sx - f.v.x * d, sy - f.v.y * d) < 0.4) { best = Math.max(best, d); break; }
      if (d + ms >= 0.8 * f.L) best = Math.max(best, d);
    }
  }
  const d = clamp(best, 0.2 * f.L, 0.45 * f.L);
  f.crown = { x: f.forehead.x - f.v.x * d, y: f.forehead.y - f.v.y * d };
}

function lumStats(ctx, x0, y0, x1, y1, filter) {
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(ctx.canvas.width, Math.round(x1)); y1 = Math.min(ctx.canvas.height, Math.round(y1));
  if (x1 <= x0 || y1 <= y0) return null;
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let s = 0, s2 = 0, n = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    if (filter && !filter(x0 + (p % (x1 - x0)), y0 + Math.floor(p / (x1 - x0)))) continue;
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    s += l; s2 += l * l; n++;
  }
  if (!n) return null;
  const mean = s / n;
  return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), n };
}

function measureLight() {
  const f = S.face, k = S.smallScale;
  const ctx = S.small.getContext('2d', { willReadFrequently: true });
  const { minX, minY, maxX, maxY } = f.box;
  const cx = (f.nose.x) / k, y0 = (minY + (maxY - minY) * 0.35) / k, y1 = (minY + (maxY - minY) * 0.8) / k;
  const w = (maxX - minX) / k;
  const L = lumStats(ctx, cx - w * 0.38, y0, cx - w * 0.08, y1);
  const R = lumStats(ctx, cx + w * 0.08, y0, cx + w * 0.38, y1);
  if (!L || !R) return;
  S.light = { mean: (L.mean + R.mean) / 2, balance: Math.abs(L.mean - R.mean) / Math.max(1, Math.max(L.mean, R.mean)) };
}

function measureBackground() {
  const ctx = S.small.getContext('2d', { willReadFrequently: true });
  const w = S.small.width, h = S.small.height;
  if (S.maskData) {
    const mw = S.mask.width, ms = S.maskScale / S.smallScale, md = S.maskData;
    S.bgStat = lumStats(ctx, 0, 0, w, h, (x, y) => (x + y) % 3 === 0 && md[(Math.round(y / ms) * mw + Math.round(x / ms)) * 4 + 3] < 25);
  } else {
    const a = lumStats(ctx, 0, 0, w * 0.15, h * 0.25), b = lumStats(ctx, w * 0.85, 0, w, h * 0.25);
    if (a && b) S.bgStat = { mean: (a.mean + b.mean) / 2, std: Math.max(a.std, b.std) + Math.abs(a.mean - b.mean) / 2 };
  }
}

function autoFit() {
  const fmt = S.format, f = S.face;
  if (!f) {
    const span = Math.min(S.src.height, S.src.width * fmt.h / fmt.w);
    S.t = { cx: S.src.width / 2, cy: S.src.height / 2, span, rot: 0 };
  } else {
    const P = f.eyeMid;
    const proj = (p, w) => (p.x - P.x) * w.x + (p.y - P.y) * w.y;
    const dCrown = proj(f.crown, f.v), dChin = proj(f.chin, f.v);
    const span = (dChin - dCrown) / fmt.target;
    const dc = dCrown - fmt.top * span + span / 2;
    const du = (proj(f.left, f.u) + proj(f.right, f.u)) / 2;
    S.t = { cx: P.x + f.u.x * du + f.v.x * dc, cy: P.y + f.u.y * du + f.v.y * dc, span, rot: -f.angle };
  }
  S.autoSpan = S.t.span; S.autoRot = S.t.rot;
  requestRender();
}

// Quellkoordinate -> normierte Fotokoordinate (0..1)
function toOut(p) {
  const { cx, cy, span, rot } = S.t;
  const dx = p.x - cx, dy = p.y - cy, c = Math.cos(rot), s = Math.sin(rot);
  const aspect = S.format.w / S.format.h;
  return { x: (c * dx - s * dy) / (span * aspect) + 0.5, y: (s * dx + c * dy) / span + 0.5 };
}

// ---------- Editor ----------
const preview = $('#preview'), guides = $('#guides'), frame = $('#previewFrame');
let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderPreview(); });
}
function layoutPreview() {
  if (!S.src) return;
  const fmt = S.format;
  const maxW = Math.min($('#previewArea').clientWidth - 8, 440);
  const maxH = Math.max(220, window.innerHeight * 0.4);
  let h = maxH, w = h * fmt.w / fmt.h;
  if (w > maxW) { w = maxW; h = w * fmt.h / fmt.w; }
  frame.style.width = w + 'px'; frame.style.height = h + 'px';
  $('#dims').textContent = `${fmtName(fmt)} · ${fmtSize(fmt)}`;
  requestRender();
}
window.addEventListener('resize', () => { if (stack[stack.length - 1] === 'editor') layoutPreview(); });

function renderPreview() {
  if (!S.src) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(frame.clientWidth * dpr), H = Math.round(frame.clientHeight * dpr);
  if (!W || !H) return;
  renderPhoto(S, W, H, preview);
  drawGuides(W, H);
  updateChecks();
}

function drawGuides(W, H) {
  guides.width = W; guides.height = H;
  const g = guides.getContext('2d');
  if (!S.guides) return;
  const fmt = S.format, dpr = W / frame.clientWidth;
  g.lineWidth = 1.5 * dpr;
  const top = fmt.top * H;
  const chinMin = (fmt.top + fmt.head[0]) * H, chinMax = (fmt.top + fmt.head[1]) * H;
  g.fillStyle = 'rgba(22,163,74,0.18)';
  g.fillRect(0, chinMin, W, chinMax - chinMin);
  g.setLineDash([6 * dpr, 5 * dpr]);
  g.strokeStyle = 'rgba(22,163,74,0.9)';
  g.beginPath(); g.moveTo(0, top); g.lineTo(W, top); g.stroke();
  g.strokeStyle = 'rgba(37,99,235,0.6)';
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  const ry = fmt.target / 2 * H, cy = top + ry;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(W / 2, cy, ry * 0.72, ry, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.font = `${11 * dpr}px -apple-system, sans-serif`;
  g.fillStyle = 'rgba(22,163,74,1)';
  const lbl = getLang() === 'tr' ? ['Tepe', 'Çene'] : ['Scheitel', 'Kinn'];
  g.fillText(lbl[0], 4 * dpr, top - 4 * dpr);
  g.fillText(lbl[1], 4 * dpr, chinMax + 13 * dpr);
}

// Gesten: ziehen, pinch-zoom, drehen, Mausrad
const ptrs = new Map();
frame.addEventListener('pointerdown', e => {
  try { frame.setPointerCapture(e.pointerId); } catch { /* synthetisch */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
frame.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const old = ptrs.get(e.pointerId);
  const prev = [...ptrs.values()].map(p => ({ ...p }));
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const cur = [...ptrs.values()];
  const k = S.t.span / frame.clientHeight; // Quellpixel pro CSS-Pixel
  let dx, dy;
  if (cur.length >= 2) {
    const [a0, b0] = prev, [a1, b1] = cur;
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    const ang0 = Math.atan2(b0.y - a0.y, b0.x - a0.x), ang1 = Math.atan2(b1.y - a1.y, b1.x - a1.x);
    if (d0 > 10 && d1 > 10) S.t.span = clamp(S.t.span * d0 / d1, S.autoSpan * 0.4, S.autoSpan * 2.5);
    let da = ang1 - ang0;
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    S.t.rot = clamp(S.t.rot + da, S.autoRot - 0.35, S.autoRot + 0.35);
    dx = ((a1.x + b1.x) - (a0.x + b0.x)) / 2; dy = ((a1.y + b1.y) - (a0.y + b0.y)) / 2;
  } else {
    dx = e.clientX - old.x; dy = e.clientY - old.y;
  }
  const c = Math.cos(-S.t.rot), s = Math.sin(-S.t.rot);
  S.t.cx -= (c * dx - s * dy) * k;
  S.t.cy -= (s * dx + c * dy) * k;
  syncCropSliders();
  requestRender();
});
const endPtr = e => ptrs.delete(e.pointerId);
frame.addEventListener('pointerup', endPtr);
frame.addEventListener('pointercancel', endPtr);
frame.addEventListener('wheel', e => {
  e.preventDefault();
  S.t.span = clamp(S.t.span * Math.exp(e.deltaY * 0.0015), S.autoSpan * 0.4, S.autoSpan * 2.5);
  syncCropSliders(); requestRender();
}, { passive: false });

// Regler
function setOut(input, txt) { const o = input.parentElement.querySelector('output'); if (o) o.textContent = txt; }
function syncCropSliders() {
  const z = $('#sZoom'), r = $('#sRot');
  z.value = Math.round(100 * S.autoSpan / S.t.span); setOut(z, z.value + '%');
  const deg = S.t.rot * 180 / Math.PI;
  r.value = deg.toFixed(1); setOut(r, deg.toFixed(1) + '°');
}
function syncControls() {
  syncCropSliders();
  $('#tGuides').checked = S.guides;
  $('#tBg').checked = S.bg.replace;
  $('#tBg').disabled = !S.mask;
  $('#sEdge').value = Math.round(S.bg.feather * 100); setOut($('#sEdge'), $('#sEdge').value);
  $$('[data-adj]').forEach(i => { i.value = S.adj[i.dataset.adj]; setOut(i, i.value); });
  $('#tGray').checked = S.adj.gray;
  renderSwatches();
}
$('#sZoom').addEventListener('input', e => { S.t.span = S.autoSpan * 100 / +e.target.value; setOut(e.target, e.target.value + '%'); requestRender(); });
$('#sRot').addEventListener('input', e => { S.t.rot = +e.target.value * Math.PI / 180; setOut(e.target, (+e.target.value).toFixed(1) + '°'); requestRender(); });
$('#btnAuto2').onclick = () => { autoFit(); syncCropSliders(); };
$('#tGuides').onchange = e => { S.guides = e.target.checked; requestRender(); };
$('#tBg').onchange = e => { S.bg.replace = e.target.checked; requestRender(); };
$('#sEdge').addEventListener('input', e => { S.bg.feather = +e.target.value / 100; setOut(e.target, e.target.value); requestRender(); });
$$('[data-adj]').forEach(i => i.addEventListener('input', () => { S.adj[i.dataset.adj] = +i.value; setOut(i, i.value); requestRender(); }));
$('#tGray').onchange = e => { S.adj.gray = e.target.checked; requestRender(); };
$('#btnResetAdj').onclick = () => { S.adj = { ...DEFAULT_ADJ }; syncControls(); requestRender(); };
$('#btnEnhance').onclick = () => {
  const m = S.light?.mean ?? 140;
  S.adj = { ...S.adj, brightness: Math.round(clamp((150 - m) * 0.45, -35, 35)), contrast: 8, saturation: 0, sharpen: 30, warmth: 0 };
  syncControls(); requestRender();
};
function renderSwatches() {
  const box = $('#swatches'); box.innerHTML = '';
  const colors = [...new Set([S.format.bg, ...BG_COLORS])];
  colors.forEach(c => {
    const b = document.createElement('button');
    b.className = 'swatch' + (S.bg.color === c ? ' selected' : '');
    b.style.background = c; b.setAttribute('aria-label', c);
    b.onclick = () => { S.bg.color = c; S.bg.replace = !!S.mask; syncControls(); requestRender(); };
    box.appendChild(b);
  });
  const p = document.createElement('label');
  p.className = 'swatch picker' + (!colors.includes(S.bg.color) ? ' selected' : '');
  p.innerHTML = '<input type="color">';
  p.querySelector('input').value = S.bg.color;
  p.querySelector('input').oninput = e => { S.bg.color = e.target.value; S.bg.replace = !!S.mask; requestRender(); };
  p.querySelector('input').onchange = () => syncControls();
  box.appendChild(p);
}
$$('.tab').forEach(tb => tb.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === tb));
  $$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tb.dataset.tab));
});
$('#checkSummary').onclick = () => $('.tab[data-tab="check"]').click();

// ---------- Prüfungen ----------
function computeChecks() {
  const fmt = S.format, f = S.face, out = [];
  const add = (key, st, detail = '') => out.push({ key, st, detail });
  const mm = v => (v * fmt.h).toFixed(1) + ' mm';
  if (!S.aiOk) add('chkFace', 'na');
  else if (!S.faces.length) add('chkFace', 'bad');
  else if (S.faces.length > 1) add('chkMulti', 'warn');
  else add('chkFace', 'ok');

  if (f) {
    const cr = toOut(f.crown), ch = toOut(f.chin);
    const head = ch.y - cr.y;
    const [lo, hi] = fmt.head;
    add('chkHead', head >= lo && head <= hi ? 'ok' : (head >= lo * 0.95 && head <= hi * 1.05 ? 'warn' : 'bad'),
      `${mm(head)} (${mm(lo)} – ${mm(hi)})`);
    add('chkTop', cr.y > 0.01 && ch.y < 0.99 ? 'ok' : 'bad');
    const mid = (toOut(f.left).x + toOut(f.right).x) / 2;
    const off = Math.abs(mid - 0.5);
    add('chkCenter', off < 0.04 ? 'ok' : off < 0.08 ? 'warn' : 'bad', `${(off * fmt.w).toFixed(1)} mm`);
    const roll = Math.abs((f.angle + S.t.rot) * 180 / Math.PI);
    add('chkRoll', roll < 2 ? 'ok' : roll < 5 ? 'warn' : 'bad', roll.toFixed(1) + '°');
    const pu = p => (p.x - f.left.x) * f.u.x + (p.y - f.left.y) * f.u.y;
    const yaw = Math.abs(pu(f.nose) / Math.max(1, pu(f.right)) - 0.5);
    add('chkYaw', yaw < 0.06 ? 'ok' : yaw < 0.11 ? 'warn' : 'bad');
    const b = f.blend || {};
    if ('eyeBlinkLeft' in b) {
      const blink = Math.max(b.eyeBlinkLeft, b.eyeBlinkRight);
      add('chkEyes', blink < 0.45 ? 'ok' : blink < 0.6 ? 'warn' : 'bad');
      const smile = ((b.mouthSmileLeft || 0) + (b.mouthSmileRight || 0)) / 2;
      add('chkMouth', (b.jawOpen || 0) < 0.12 && smile < 0.45 ? 'ok' : 'warn');
    }
    if (S.light) {
      const bright = S.light.mean * (1 + S.adj.brightness / 100);
      add('chkExposure', bright > 95 && bright < 215 ? 'ok' : 'warn', Math.round(bright) + ' / 255');
      add('chkLight', S.light.balance < 0.15 ? 'ok' : S.light.balance < 0.28 ? 'warn' : 'bad', Math.round(S.light.balance * 100) + ' %');
    }
  }
  if (S.bg.replace && S.mask) add('chkBg', 'ok', '✓ ' + S.bg.color);
  else if (S.bgStat) add('chkBg', S.bgStat.mean > 175 && S.bgStat.std < 28 ? 'ok' : 'warn', `Ø ${Math.round(S.bgStat.mean)}, σ ${Math.round(S.bgStat.std)}`);
  if (S.src) {
    const dpi = S.t.span / (fmt.h / 25.4);
    add('chkRes', dpi >= 300 ? 'ok' : dpi >= 200 ? 'warn' : 'bad', `≈ ${Math.round(dpi)} dpi`);
  }
  return out;
}
function updateChecks() {
  const list = computeChecks();
  const ul = $('#checkList'); ul.innerHTML = '';
  const sym = { ok: '✓', warn: '!', bad: '✕', na: '?' };
  list.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="st ${c.st}">${sym[c.st]}</span><span><span class="lbl"></span><small></small></span>`;
    li.querySelector('.lbl').textContent = t(c.key);
    li.querySelector('small').textContent = c.detail;
    ul.appendChild(li);
  });
  const issues = list.filter(c => c.st === 'warn' || c.st === 'bad').length;
  const sum = $('#checkSummary');
  if (!S.aiOk) { sum.className = 'check-summary'; sum.textContent = t('chkManual'); }
  else if (!issues) { sum.className = 'check-summary ok'; sum.textContent = '✓ ' + t('chkAllOk'); }
  else { sum.className = 'check-summary warn'; sum.textContent = '⚠ ' + t('chkSome', { n: issues }); }
}

// ---------- Kamera ----------
const video = $('#video'), camOv = $('#camOverlay');
let stream = null, camLoop = 0, goodSince = 0, counting = false, lastLum = 0, lumCheck = 0;
async function startCamera() {
  go('camera');
  $('#camHint').textContent = t('camStart');
  $('#camHint').className = 'cam-hint';
  await openStream();
}
async function openStream() {
  stopStream();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no getUserMedia');
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: S.facing, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false,
    });
    video.srcObject = stream;
    video.classList.toggle('mirror', S.facing === 'user');
    await video.play();
    initVideo().catch(e => console.warn('video AI', e));
    cancelAnimationFrame(camLoop);
    camLoop = requestAnimationFrame(camTick);
  } catch (e) {
    console.error(e);
    toast(t('camError'), 4000);
    if (stack[stack.length - 1] === 'camera') history.back();
  }
}
function stopStream() {
  cancelAnimationFrame(camLoop);
  if (stream) stream.getTracks().forEach(tr => tr.stop());
  stream = null;
}
function stopCamera() { stopStream(); counting = false; $('#countdown').hidden = true; }

let lastDetect = 0;
function camTick(ts) {
  camLoop = requestAnimationFrame(camTick);
  if (!stream || video.readyState < 2) return;
  if (ts - lastDetect < 90) return;
  lastDetect = ts;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.round(camOv.clientWidth * dpr), H = Math.round(camOv.clientHeight * dpr);
  if (camOv.width !== W || camOv.height !== H) { camOv.width = W; camOv.height = H; }
  const fmt = S.format, a = fmt.w / fmt.h;
  let bh = H * 0.7, bw = bh * a;
  if (bw > W * 0.84) { bw = W * 0.84; bh = bw / a; }
  const bx = (W - bw) / 2, by = H * 0.46 - bh / 2;

  let lm = null;
  try { lm = detectVideo(video, performance.now()); } catch (e) { /* noch nicht bereit */ }

  // Helligkeit grob messen
  if (ts - lumCheck > 1000) {
    lumCheck = ts;
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(video, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lastLum = s / (d.length / 4);
  }

  let hint = 'hintNoFace', good = false;
  const vw = video.videoWidth, vh = video.videoHeight, sc = Math.max(W / vw, H / vh);
  const ox = (W - vw * sc) / 2, oy = (H - vh * sc) / 2, mirror = S.facing === 'user';
  const SP = p => { let x = ox + p.x * vw * sc; if (mirror) x = W - x; return { x, y: oy + p.y * vh * sc }; };
  if (lm) {
    const fh = SP(lm[10]), ch = SP(lm[152]), l = SP(lm[234]), r = SP(lm[454]), n = SP(lm[1]);
    const e1 = SP(lm[468] || lm[33]), e2 = SP(lm[473] || lm[263]);
    const crownY = fh.y - 0.3 * (ch.y - fh.y);
    const ratio = (ch.y - crownY) / (fmt.target * bh);
    const fcx = (l.x + r.x) / 2, dx = (fcx - (bx + bw / 2)) / bw;
    const dy = (crownY - (by + fmt.top * bh)) / bh;
    const [ea, eb] = e1.x < e2.x ? [e1, e2] : [e2, e1];
    const roll = Math.abs(Math.atan2(eb.y - ea.y, eb.x - ea.x) * 180 / Math.PI);
    const [ll, rr] = l.x < r.x ? [l, r] : [r, l];
    const yaw = Math.abs((n.x - ll.x) / Math.max(1, rr.x - ll.x) - 0.5);
    if (ratio < 0.85) hint = 'hintCloser';
    else if (ratio > 1.15) hint = 'hintFurther';
    else if (dx > 0.07) hint = 'hintLeft';
    else if (dx < -0.07) hint = 'hintRight';
    else if (dy > 0.07) hint = 'hintUp';
    else if (dy < -0.07) hint = 'hintDown';
    else if (roll > 4) hint = 'hintStraight';
    else if (yaw > 0.09) hint = 'hintLook';
    else if (lastLum && lastLum < 60) hint = 'hintDark';
    else { hint = 'hintGood'; good = true; }
  }
  const hEl = $('#camHint');
  hEl.textContent = t(hint);
  hEl.className = 'cam-hint' + (good ? ' good' : '');
  $('#btnShutter').classList.toggle('ready', good);

  // Overlay zeichnen
  const g = camOv.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.beginPath(); g.rect(0, 0, W, H); g.rect(bx, by, bw, bh); g.fill('evenodd');
  g.lineWidth = 3 * dpr;
  g.strokeStyle = good ? '#22c55e' : '#ffffff';
  g.strokeRect(bx, by, bw, bh);
  const ry = fmt.target / 2 * bh;
  g.setLineDash([8 * dpr, 6 * dpr]);
  g.lineWidth = 2 * dpr;
  g.beginPath(); g.ellipse(bx + bw / 2, by + fmt.top * bh + ry, ry * 0.74, ry, 0, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);

  if (good && S.auto && !counting) {
    if (!goodSince) goodSince = ts;
    else if (ts - goodSince > 1300) { goodSince = 0; shoot(); }
  } else if (!good) goodSince = 0;
}

async function shoot() {
  if (counting || !stream) return;
  counting = true;
  const cd = $('#countdown');
  for (let i = S.timer; i > 0; i--) {
    cd.hidden = false; cd.textContent = i;
    await new Promise(r => setTimeout(r, 1000));
    if (!stream) { counting = false; cd.hidden = true; return; }
  }
  cd.hidden = true;
  const fl = $('#flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
  const c = document.createElement('canvas');
  c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  stopCamera();
  counting = false;
  setSource(c, c.width, c.height);
  try { await analyze(); } catch (e) { console.error(e); busy(null); }
  go('editor', { replace: true });
}
$('#btnCamera').onclick = startCamera;
$('#btnShutter').onclick = shoot;
$('#btnTimer').onclick = () => {
  S.timer = S.timer === 0 ? 3 : S.timer === 3 ? 10 : 0;
  $('#timerLabel').textContent = S.timer + 's';
};
$('#btnAuto').onclick = () => { S.auto = !S.auto; $('#btnAuto').setAttribute('aria-pressed', S.auto); goodSince = 0; };
$('#btnFlip').onclick = () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; openStream(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopStream();
  else if (stack[stack.length - 1] === 'camera' && !stream) openStream();
});

// ---------- Export ----------
let exportTimer = 0, sheetUrl = null, photoUrl = null;
function photoAtDpi(dpi) {
  const fmt = S.photoFmt;
  const W = mmToPx(fmt.w, dpi), H = mmToPx(fmt.h, dpi);
  if (S.photo.width === W && S.photo.height === H) return S.photo;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(S.photo, 0, 0, W, H);
  return c;
}
async function enterExport() {
  busy(t('analyzing')); await nextFrame();
  const fmt = { ...S.format };
  const c = document.createElement('canvas');
  renderPhoto(S, mmToPx(fmt.w, 600), mmToPx(fmt.h, 600), c);
  S.photo = c; S.photoFmt = fmt;
  busy(null);
  go('export');
  await updateExport();
  try {
    const blob = await jpegWithDpi(c, 600, 0.93);
    const th = document.createElement('canvas'); th.width = 150; th.height = Math.round(150 * fmt.h / fmt.w);
    th.getContext('2d').drawImage(c, 0, 0, th.width, th.height);
    await addEntry({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), date: Date.now(), fmt, buf: await blob.arrayBuffer(), thumb: th.toDataURL('image/jpeg', 0.8) });
    toast(t('saved'));
  } catch (e) { console.warn('history', e); }
}
function paper() { return PAPERS.find(p => p.id === S.ex.paper) || PAPERS[0]; }
function sheetOpts() {
  const fmt = S.photoFmt;
  return { dpi: S.ex.dpi, gap: S.ex.gap, count: S.ex.count, cutLines: S.ex.cut, label: `${fmtSize(fmt)} · ${getLang() === 'tr' ? '%100 boyutta yazdırın' : 'in 100 % drucken'}` };
}
async function updateExport() {
  const fmt = S.photoFmt;
  // Optionen füllen
  const ps = $('#oPaper');
  if (!ps.options.length) PAPERS.forEach(p => ps.add(new Option(p.name, p.id)));
  ps.value = S.ex.paper; $('#oDpi').value = S.ex.dpi; $('#oGap').value = S.ex.gap; $('#oCut').checked = S.ex.cut;
  const L = sheetLayout(fmt, paper(), S.ex.gap);
  const cs = $('#oCount'); cs.innerHTML = '';
  for (let i = 1; i <= Math.max(1, L.n); i++) cs.add(new Option(i, i));
  if (!S.ex.count || S.ex.count > L.n) S.ex.count = L.n;
  cs.value = S.ex.count;

  const photo = photoAtDpi(S.ex.dpi);
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = URL.createObjectURL(await canvasToBlob(photo, 'image/jpeg', 0.9));
  $('#exPhoto').src = photoUrl;
  $('#exPhotoMeta').textContent = `${fmtSize(fmt)} · ${photo.width}×${photo.height} px · ${S.ex.dpi} dpi`;

  const sh = renderSheet(photo, fmt, paper(), { ...sheetOpts(), dpi: 150 });
  if (sheetUrl) URL.revokeObjectURL(sheetUrl);
  sheetUrl = URL.createObjectURL(await canvasToBlob(sh.canvas, 'image/jpeg', 0.85));
  $('#exSheet').src = sheetUrl;
  $('#exSheetMeta').textContent = `${paper().name} · ${t('photosPerSheet', { n: sh.n })}`;
}
function scheduleExport() { clearTimeout(exportTimer); exportTimer = setTimeout(updateExport, 120); }
$('#oDpi').onchange = e => { S.ex.dpi = +e.target.value; localStorage.setItem('pf-dpi', S.ex.dpi); scheduleExport(); };
$('#oPaper').onchange = e => { S.ex.paper = e.target.value; S.ex.count = 0; localStorage.setItem('pf-paper', S.ex.paper); scheduleExport(); };
$('#oGap').onchange = e => { S.ex.gap = clamp(+e.target.value || 0, 0, 10); S.ex.count = 0; scheduleExport(); };
$('#oCount').onchange = e => { S.ex.count = +e.target.value; scheduleExport(); };
$('#oCut').onchange = e => { S.ex.cut = e.target.checked; scheduleExport(); };

const baseName = () => `passfoto_${S.photoFmt.id}_${S.photoFmt.w}x${S.photoFmt.h}mm`;
async function photoBlob() { return jpegWithDpi(photoAtDpi(S.ex.dpi), S.ex.dpi); }
async function sheetData() {
  busy(t('analyzing')); await nextFrame();
  try {
    const sh = renderSheet(photoAtDpi(S.ex.dpi), S.photoFmt, paper(), sheetOpts());
    const blob = await jpegWithDpi(sh.canvas, S.ex.dpi, 0.93);
    return { blob, sh };
  } finally { busy(null); }
}
$('#bPhotoJpg').onclick = async () => { downloadBlob(await photoBlob(), baseName() + `_${S.ex.dpi}dpi.jpg`); toast(t('downloaded')); };
$('#bSheetJpg').onclick = async () => { const { blob } = await sheetData(); downloadBlob(blob, baseName() + `_${S.ex.paper}.jpg`); toast(t('downloaded')); };
$('#bSheetPdf').onclick = async () => {
  const { blob, sh } = await sheetData();
  const pdf = await makePdf(blob, sh.canvas.width, sh.canvas.height, sh.pageW, sh.pageH);
  downloadBlob(pdf, baseName() + `_${S.ex.paper}.pdf`); toast(t('downloaded'));
};
$('#bShare').onclick = async () => {
  const { blob } = await sheetData();
  const photo = await photoBlob();
  const files = [new File([photo], baseName() + '.jpg', { type: 'image/jpeg' }), new File([blob], baseName() + `_${S.ex.paper}.jpg`, { type: 'image/jpeg' })];
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: 'PassFoto' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  if (!(await shareBlob(photo, baseName() + '.jpg', 'PassFoto'))) { downloadBlob(photo, baseName() + '.jpg'); toast(t('shareFail'), 3500); }
};
$('#bPrint').onclick = async () => { const { blob, sh } = await sheetData(); printAtSize(blob, sh.pageW, sh.pageH); };
$('#bNew').onclick = () => { if (stack.length > 1) history.go(-(stack.length - 1)); };

// ---------- Verlauf ----------
async function renderHistory() {
  const box = $('#historyList'); box.innerHTML = '';
  let items = [];
  try { items = await listEntries(); } catch (e) { console.warn(e); }
  $('#historyEmpty').hidden = items.length > 0;
  const loc = getLang() === 'tr' ? 'tr-TR' : 'de-DE';
  items.forEach(it => {
    const d = document.createElement('div'); d.className = 'hitem';
    d.innerHTML = `<img alt=""><div class="meta"></div><div class="row"><button class="btn small open"></button><button class="btn small ghost del"></button></div>`;
    d.querySelector('img').src = it.thumb;
    d.querySelector('.meta').textContent = `${fmtSize(it.fmt)} · ${new Date(it.date).toLocaleDateString(loc)}`;
    d.querySelector('.open').textContent = t('open');
    d.querySelector('.del').textContent = t('del');
    const open = async () => {
      const img = new Image(); const url = URL.createObjectURL(it.blob || new Blob([it.buf], { type: 'image/jpeg' })); img.src = url; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url);
      S.photo = c; S.photoFmt = it.fmt;
      go('export'); updateExport();
    };
    d.querySelector('img').onclick = open;
    d.querySelector('.open').onclick = open;
    d.querySelector('.del').onclick = async () => { if (confirm(t('confirmDel'))) { await removeEntry(it.id); renderHistory(); } };
    box.appendChild(d);
  });
}
$('#btnHistory').onclick = () => go('history');
$('#btnToExport').onclick = enterExport;

// ---------- Sprache, Installation, Offline ----------
function refreshLang() {
  $('#btnLang').textContent = getLang() === 'tr' ? 'TR' : 'DE';
  applyI18n(); renderFormats(); renderRules();
  if (stack[stack.length - 1] === 'editor') { layoutPreview(); }
  if (stack[stack.length - 1] === 'export' && S.photo) updateExport();
  if (stack[stack.length - 1] === 'history') renderHistory();
}
$('#btnLang').onclick = () => { setLang(getLang() === 'de' ? 'tr' : 'de'); refreshLang(); };

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; });
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIOS && !standalone) $('#btnInstall').hidden = false;
$('#btnInstall').onclick = async () => {
  if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; }
  else toast(getLang() === 'tr' ? 'Safari’de „Paylaş“ → „Ana Ekrana Ekle“ seçin' : 'In Safari „Teilen“ → „Zum Home-Bildschirm“ wählen', 5000);
};
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}

// ---------- Start ----------
S.ex.dpi = +localStorage.getItem('pf-dpi') || 600;
S.ex.paper = localStorage.getItem('pf-paper') || '10x15';
selectFormat(localStorage.getItem('pf-format') || 'tr');
history.replaceState({ s: 'home' }, '');
refreshLang();
// KI im Hintergrund vorladen, damit die Analyse später schneller ist
setTimeout(() => initVision().catch(() => {}), 1500);

// für Tests
window.__pf = { S, loadFile, analyze, computeChecks, enterExport };
