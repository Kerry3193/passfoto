import { mmToPx } from './formats.js';

export function canvasToBlob(canvas, type = 'image/jpeg', q = 0.95) {
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), type, q));
}

// Setzt die DPI im JFIF-Header, damit Druckprogramme die echte Größe kennen
export async function jpegWithDpi(canvas, dpi, q = 0.95) {
  const blob = await canvasToBlob(canvas, 'image/jpeg', q);
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return blob;
  const isJfif = buf[2] === 0xff && buf[3] === 0xe0 && buf[6] === 0x4a && buf[7] === 0x46 && buf[8] === 0x49 && buf[9] === 0x46;
  let out;
  if (isJfif) {
    out = buf;
    out[13] = 1; // Einheit: dots per inch
    out[14] = dpi >> 8; out[15] = dpi & 255;
    out[16] = dpi >> 8; out[17] = dpi & 255;
  } else {
    const app0 = new Uint8Array([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, dpi >> 8, dpi & 255, dpi >> 8, dpi & 255, 0, 0]);
    out = new Uint8Array(buf.length + app0.length);
    out.set(buf.subarray(0, 2), 0);
    out.set(app0, 2);
    out.set(buf.subarray(2), 2 + app0.length);
  }
  return new Blob([out], { type: 'image/jpeg' });
}

// Minimales PDF mit einem JPEG als ganzseitigem Bild in exakter Papiergröße
export async function makePdf(jpegBlob, pxW, pxH, pageWmm, pageHmm) {
  const jpg = new Uint8Array(await jpegBlob.arrayBuffer());
  const W = (pageWmm / 25.4 * 72).toFixed(2), H = (pageHmm / 25.4 * 72).toFixed(2);
  const enc = new TextEncoder();
  const parts = []; const offsets = []; let len = 0;
  const push = (p) => { const b = typeof p === 'string' ? enc.encode(p) : p; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
  push(jpg);
  push('\nendstream\nendobj\n');
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let x = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

// Berechnet das beste Raster (Hoch- oder Querformat) für den Druckbogen
// safe: 3 mm Sicherheitsrand, weil Fotoautomaten beim randlosen Druck die Kanten beschneiden
export function sheetLayout(fmt, paper, gap, safe = false) {
  const best = [paper.w, paper.h].map((_, rot) => {
    const pw = rot ? paper.h : paper.w, ph = rot ? paper.w : paper.h;
    const m = safe ? Math.max(paper.margin, 3) : paper.margin;
    const cols = Math.max(0, Math.floor((pw - 2 * m + gap) / (fmt.w + gap)));
    const rows = Math.max(0, Math.floor((ph - 2 * m + gap) / (fmt.h + gap)));
    return { pw, ph, cols, rows, n: cols * rows };
  }).sort((a, b) => b.n - a.n || (a.pw < a.ph ? -1 : 1))[0];
  return best;
}

export function renderSheet(photo, fmt, paper, opts) {
  const { dpi, gap, count, cutLines, label, safe } = opts;
  const L = sheetLayout(fmt, paper, gap, safe);
  const W = mmToPx(L.pw, dpi), H = mmToPx(L.ph, dpi);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  const px = mm => (mm / 25.4) * dpi;
  const gw = L.cols * fmt.w + (L.cols - 1) * gap, gh = L.rows * fmt.h + (L.rows - 1) * gap;
  const ox = (L.pw - gw) / 2, oy = (L.ph - gh) / 2;
  const n = Math.max(0, Math.min(count || L.n, L.n));
  ctx.imageSmoothingQuality = 'high';
  let k = 0;
  for (let r = 0; r < L.rows; r++) for (let col = 0; col < L.cols; col++) {
    if (k++ >= n) continue;
    const x = ox + col * (fmt.w + gap), y = oy + r * (fmt.h + gap);
    ctx.drawImage(photo, Math.round(px(x)), Math.round(px(y)), Math.round(px(fmt.w)), Math.round(px(fmt.h)));
  }
  if (cutLines && n > 0) {
    ctx.strokeStyle = '#9aa0a6';
    ctx.lineWidth = Math.max(1, dpi / 300);
    ctx.setLineDash([px(1.5), px(1)]);
    const xs = new Set(), ys = new Set();
    for (let col = 0; col < L.cols; col++) { xs.add(ox + col * (fmt.w + gap)); xs.add(ox + col * (fmt.w + gap) + fmt.w); }
    for (let r = 0; r < L.rows; r++) { ys.add(oy + r * (fmt.h + gap)); ys.add(oy + r * (fmt.h + gap) + fmt.h); }
    const mark = 4; // mm Länge der Schnittmarken außerhalb des Rasters
    ctx.beginPath();
    for (const x of xs) {
      ctx.moveTo(px(x), px(Math.max(0, oy - mark))); ctx.lineTo(px(x), px(oy));
      ctx.moveTo(px(x), px(oy + gh)); ctx.lineTo(px(x), px(Math.min(L.ph, oy + gh + mark)));
    }
    for (const y of ys) {
      ctx.moveTo(px(Math.max(0, ox - mark)), px(y)); ctx.lineTo(px(ox), px(y));
      ctx.moveTo(px(ox + gw), px(y)); ctx.lineTo(px(Math.min(L.pw, ox + gw + mark)), px(y));
    }
    ctx.stroke();
    // feine Linien zwischen den Fotos (nur bei Abstand 0 sichtbar hilfreich)
    if (gap === 0) {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const x of xs) { ctx.moveTo(px(x), px(oy)); ctx.lineTo(px(x), px(oy + gh)); }
      for (const y of ys) { ctx.moveTo(px(ox), px(y)); ctx.lineTo(px(ox + gw), px(y)); }
      ctx.stroke();
    }
  }
  if (label && L.ph - (oy + gh) > 5) {
    ctx.setLineDash([]);
    ctx.fillStyle = '#80868b';
    ctx.font = `${px(2.2)}px -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, px(L.pw / 2), px(oy + gh + Math.min(6, (L.ph - oy - gh) / 2 + 1)));
  }
  return { canvas: c, layout: L, n, pageW: L.pw, pageH: L.ph };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function shareBlob(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return true; }
    catch (e) { if (e.name === 'AbortError') return true; }
  }
  return false;
}

export const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Speichern: In der installierten iOS-App funktionieren Downloads nicht zuverlässig -> Teilen-Dialog
// („In Fotos sichern“ / „In Dateien sichern“). Muss ohne vorheriges await aufgerufen werden.
export function saveFile(blob, name) {
  if (isIOS && isStandalone) {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      return navigator.share({ files: [file] }).then(() => true, e => {
        if (e.name === 'AbortError') return true;
        downloadBlob(blob, name); return false;
      });
    }
  }
  downloadBlob(blob, name);
  return Promise.resolve(true);
}

// Drucken in Originalgröße.
// iOS druckt aus einem iframe heraus die ganze Seite -> dort das PDF über den
// Teilen-Dialog anbieten (enthält „Drucken“), sonst das PDF öffnen.
export function printAtSize(jpgBlob, pdfBlob, wmm, hmm, pdfName = 'passfoto.pdf') {
  if (isIOS) {
    const file = new File([pdfBlob], pdfName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file] }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    const w = window.open(url, '_blank');
    if (!w) location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return;
  }
  const url = URL.createObjectURL(jpgBlob);
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><style>@page{size:${wmm}mm ${hmm}mm;margin:0}html,body{margin:0;padding:0}img{display:block;width:${wmm}mm;height:${hmm}mm}</style></head><body><img src="${url}"></body></html>`);
  doc.close();
  const img = doc.querySelector('img');
  const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 60000); };
  if (img.complete) go(); else img.onload = go;
}
