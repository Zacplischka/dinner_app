// Demo-only image utilities.
// Generates attractive "fake photography" SVG data-URIs so the UI feels alive without remote assets.

function encode(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length];
}

export function demoPhotoUrl(seed: string, label?: string) {
  const h = hash(seed);

  const palettes = [
    { a: '#ff6b7e', b: '#ff3858', c: '#030712' },
    { a: '#35e7ff', b: '#0c7f92', c: '#030712' },
    { a: '#c7ff1a', b: '#547500', c: '#07111f' },
    { a: '#b146ff', b: '#5b1b94', c: '#030712' },
    { a: '#ffb627', b: '#8b5d00', c: '#07111f' },
  ];

  const p = pick(palettes, h);
  const t1 = (h % 100) / 100;
  const t2 = ((h >> 8) % 100) / 100;

  const text = label ?? seed;
  const initial = (text.trim()[0] || 'D').toUpperCase();

  // A faux-photo: layered gradients + grain + bokeh blobs + subtle highlight.
  // 3:4 portrait works well for list thumbs and swipe cards.
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.c}"/>
      <stop offset="0.55" stop-color="${p.b}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${p.a}" stop-opacity="0.35"/>
    </linearGradient>

    <radialGradient id="bokeh1" cx="${0.2 + 0.6 * t1}" cy="${0.2 + 0.6 * t2}" r="0.55">
      <stop offset="0" stop-color="${p.a}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${p.a}" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="bokeh2" cx="${0.75 - 0.4 * t2}" cy="${0.35 + 0.45 * t1}" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>

    <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>
    </filter>

    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="600" height="800" fill="url(#bg)"/>
  <rect width="600" height="800" fill="url(#bokeh1)"/>
  <rect width="600" height="800" fill="url(#bokeh2)"/>

  <path d="M-40 560 C 140 480, 240 740, 660 640 L 660 840 L -40 840 Z" fill="#000" opacity="0.25"/>
  <path d="M-40 580 C 120 520, 260 760, 660 660" fill="${p.a}" opacity="0.14"/>

  <rect x="0" y="0" width="600" height="280" fill="url(#shine)"/>

  <rect width="600" height="800" filter="url(#grain)" opacity="0.35"/>

  <g>
    <circle cx="110" cy="120" r="34" fill="#000" opacity="0.25"/>
    <circle cx="110" cy="120" r="32" fill="${p.a}" opacity="0.20"/>
    <text x="110" y="132" text-anchor="middle" font-family="Inter, sans-serif" font-size="28" font-weight="800" fill="#f8fafc" opacity="0.9">${initial}</text>
  </g>
</svg>`;

  return encode(svg.trim());
}
