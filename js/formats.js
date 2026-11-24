// Fotoformate. Maße in mm.
// head:   erlaubter Bereich Kopfhöhe (Kinn bis Scheitel) als Anteil der Fotohöhe
// target: Zielwert der Kopfhöhe für den automatischen Zuschnitt
// top:    Abstand Oberkante Foto -> Scheitel als Anteil der Fotohöhe
export const FORMATS = [
  {
    id: 'tr', flag: '🇹🇷', w: 50, h: 60,
    name: { de: 'Türkei – Reisepass / Kimlik', tr: 'Türkiye – Pasaport / Kimlik' },
    head: [0.70, 0.80], target: 0.75, top: 0.085, bg: '#ffffff',
    rules: 'tr',
  },
  {
    id: 'tr-visa', flag: '🇹🇷', w: 50, h: 60,
    name: { de: 'Türkei – Führerschein / Aufenthalt', tr: 'Türkiye – Ehliyet / İkamet' },
    head: [0.70, 0.80], target: 0.75, top: 0.085, bg: '#ffffff',
    rules: 'tr',
  },
  {
    id: 'de', flag: '🇩🇪', w: 35, h: 45,
    name: { de: 'Deutschland / EU – biometrisch', tr: 'Almanya / AB – biyometrik' },
    head: [0.711, 0.80], target: 0.755, top: 0.09, bg: '#e9ecef',
    rules: 'icao',
  },
  {
    id: 'schengen', flag: '🇪🇺', w: 35, h: 45,
    name: { de: 'Schengen-Visum', tr: 'Schengen vizesi' },
    head: [0.711, 0.80], target: 0.755, top: 0.09, bg: '#ffffff',
    rules: 'icao',
  },
  {
    id: 'uk', flag: '🇬🇧', w: 35, h: 45,
    name: { de: 'Großbritannien', tr: 'Birleşik Krallık' },
    head: [0.644, 0.756], target: 0.70, top: 0.10, bg: '#eeeeee',
    rules: 'icao',
  },
  {
    id: 'us', flag: '🇺🇸', w: 50.8, h: 50.8,
    name: { de: 'USA – Pass / Visum (2×2″)', tr: 'ABD – Pasaport / Vize (2×2″)' },
    head: [0.50, 0.69], target: 0.60, top: 0.12, bg: '#ffffff',
    rules: 'icao',
  },
  {
    id: 'ca', flag: '🇨🇦', w: 50, h: 70,
    name: { de: 'Kanada', tr: 'Kanada' },
    head: [0.443, 0.514], target: 0.48, top: 0.17, bg: '#ffffff',
    rules: 'icao',
  },
  {
    id: 'cn', flag: '🇨🇳', w: 33, h: 48,
    name: { de: 'China – Visum', tr: 'Çin – Vize' },
    head: [0.583, 0.6875], target: 0.64, top: 0.09, bg: '#ffffff',
    rules: 'icao',
  },
  {
    id: 'in', flag: '🇮🇳', w: 51, h: 51,
    name: { de: 'Indien – Visum', tr: 'Hindistan – Vize' },
    head: [0.50, 0.69], target: 0.60, top: 0.12, bg: '#ffffff',
    rules: 'icao',
  },
  {
    id: 'custom', flag: '✏️', w: 50, h: 60,
    name: { de: 'Eigenes Format', tr: 'Özel format' },
    head: [0.70, 0.80], target: 0.75, top: 0.085, bg: '#ffffff',
    rules: 'icao', custom: true,
  },
];

export const PAPERS = [
  { id: '10x15', w: 101.6, h: 152.4, name: '10 × 15 cm (4×6″)', margin: 0.5 },
  { id: '13x18', w: 127, h: 177.8, name: '13 × 18 cm (5×7″)', margin: 1 },
  { id: 'a5', w: 148, h: 210, name: 'A5', margin: 5 },
  { id: 'a4', w: 210, h: 297, name: 'A4', margin: 6 },
];

export const BG_COLORS = ['#ffffff', '#f4f4f4', '#e9ecef', '#dde3ea', '#d6e6f5', '#bcd4ec'];

export function mmToPx(mm, dpi) { return Math.round((mm / 25.4) * dpi); }
