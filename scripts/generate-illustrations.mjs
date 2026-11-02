#!/usr/bin/env node
/**
 * Generates the app's original, self-hosted illustrations (no third-party
 * images): barber portraits, before/after gallery pairs and the hero art.
 *
 *   node scripts/generate-illustrations.mjs
 *
 * Output: client/public/images/{barbers,gallery}/*.svg and client/public/images/hero.svg
 * Real shops can replace any portrait by uploading a photo in Admin → Barbers.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'public', 'images');
mkdirSync(join(root, 'barbers'), { recursive: true });
mkdirSync(join(root, 'gallery'), { recursive: true });

const HAIR = '#1c1410';
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `#${[(n >> 16) + 0, ((n >> 8) & 255), n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
};

/** Hair shapes drawn over a head centred at (100,98) with rx 40 / ry 48. */
const HAIRSTYLES = {
  fade: `<path d="M60 92 C58 52 82 40 100 40 C122 40 142 52 140 92 C136 74 128 62 100 60 C74 60 64 74 60 92Z" fill="${HAIR}"/>
         <path d="M60 92 C61 100 62 106 64 110 L64 90Z M140 92 C139 100 138 106 136 110 L136 90Z" fill="${HAIR}" opacity=".45"/>`,
  quiff: `<path d="M60 96 C56 58 74 36 104 32 C126 30 146 46 142 70 C140 82 140 90 140 96 C134 72 122 64 100 64 C80 64 66 74 60 96Z" fill="${HAIR}"/>
          <path d="M88 40 C100 22 132 24 138 44 C126 36 108 36 88 40Z" fill="${HAIR}"/>`,
  sidepart: `<path d="M59 98 C55 56 78 42 102 42 C128 42 146 58 141 98 C138 78 132 68 118 64 C104 70 80 70 66 76 C62 82 60 90 59 98Z" fill="${HAIR}"/>
             <path d="M112 44 L116 64" stroke="#3a2a20" stroke-width="2"/>`,
  waves: `<path d="M58 100 C52 58 76 40 100 40 C126 40 150 58 142 100 C140 86 136 76 128 70 C120 76 112 70 104 74 C96 68 88 76 80 70 C70 76 62 86 58 100Z" fill="${HAIR}"/>`,
  buzz: `<path d="M61 92 C60 58 80 46 100 46 C120 46 140 58 139 92 C134 70 120 62 100 62 C80 62 66 70 61 92Z" fill="${HAIR}" opacity=".85"/>`,
  long: `<path d="M56 160 C44 110 50 50 100 42 C150 50 156 110 144 160 L132 160 C138 120 136 86 128 72 C114 66 86 66 72 72 C64 86 62 120 68 160Z" fill="${HAIR}"/>
         <path d="M66 82 C74 58 126 58 134 82 C120 66 80 66 66 82Z" fill="${HAIR}"/>`,
  messy: `<path d="M56 104 C46 60 70 34 100 34 C134 34 156 60 144 104 C142 86 138 76 132 72 L136 60 L122 66 L118 54 L108 64 L98 52 L92 64 L80 56 L78 68 L66 66 L68 78 C62 84 58 92 56 104Z" fill="${HAIR}"/>`,
  turban: `<path d="M56 86 C52 50 76 30 100 30 C124 30 148 50 144 86 C130 70 116 66 100 66 C84 66 70 70 56 86Z" fill="#b8323a"/>
           <path d="M60 72 C80 50 120 46 142 70 M62 80 C86 58 118 56 140 78" stroke="#8f1f27" stroke-width="3" fill="none"/>
           <path d="M96 40 L104 40 L100 66Z" fill="#8f1f27"/>`,
};

const BEARDS = {
  none: '',
  stubble: (s) => `<path d="M64 118 C70 146 86 156 100 156 C114 156 130 146 136 118 C128 134 114 140 100 140 C86 140 72 134 64 118Z" fill="${HAIR}" opacity=".28"/>`,
  full: () => `<path d="M60 104 C60 150 84 164 100 164 C116 164 140 150 140 104 C136 120 128 128 118 130 C110 124 90 124 82 130 C72 128 64 120 60 104Z" fill="${HAIR}"/>`,
  boxed: () => `<path d="M62 110 C64 146 86 158 100 158 C114 158 136 146 138 110 C132 126 124 132 116 133 C110 128 90 128 84 133 C76 132 68 126 62 110Z" fill="${HAIR}" opacity=".92"/>`,
  goatee: () => `<path d="M90 140 C92 152 108 152 110 140 C104 144 96 144 90 140Z" fill="${HAIR}"/>`,
};

const MUSTACHE = `<path d="M84 126 C90 120 98 122 100 125 C102 122 110 120 116 126 C110 128 104 128 100 127 C96 128 90 128 84 126Z" fill="${HAIR}"/>`;

/** Front-facing portrait. */
function portrait({ skin, hair = 'fade', beard = 'none', mustache = false, shirt = '#1f1f24', accent = '#d4a24c', bg = ['#2a2a31', '#16161a'], woman = false, earrings = false, smile = true }) {
  const id = Math.random().toString(36).slice(2, 8);
  const beardSvg = typeof BEARDS[beard] === 'function' ? BEARDS[beard](skin) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img">
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
    <radialGradient id="sk${id}" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="${shade(skin, 18)}"/><stop offset="1" stop-color="${skin}"/></radialGradient>
  </defs>
  <rect width="200" height="200" fill="url(#bg${id})"/>
  <circle cx="170" cy="30" r="46" fill="${accent}" opacity=".12"/>
  ${hair === 'long' ? HAIRSTYLES.long.split('\n')[0] : ''}
  <path d="M30 200 C34 166 62 152 100 152 C138 152 166 166 170 200Z" fill="${shirt}"/>
  <path d="M84 150 L100 172 L116 150" fill="none" stroke="${accent}" stroke-width="3" opacity=".8"/>
  <rect x="88" y="128" width="24" height="30" rx="10" fill="${shade(skin, -14)}"/>
  <ellipse cx="60" cy="102" rx="8" ry="12" fill="${shade(skin, -8)}"/>
  <ellipse cx="140" cy="102" rx="8" ry="12" fill="${shade(skin, -8)}"/>
  ${earrings ? `<circle cx="60" cy="116" r="3.5" fill="${accent}"/><circle cx="140" cy="116" r="3.5" fill="${accent}"/>` : ''}
  <ellipse cx="100" cy="98" rx="40" ry="48" fill="url(#sk${id})"/>
  ${beardSvg}
  <path d="M78 88 C84 84 90 84 94 87" stroke="${HAIR}" stroke-width="${woman ? 2.5 : 4}" stroke-linecap="round" fill="none"/>
  <path d="M106 87 C110 84 116 84 122 88" stroke="${HAIR}" stroke-width="${woman ? 2.5 : 4}" stroke-linecap="round" fill="none"/>
  <ellipse cx="86" cy="98" rx="4" ry="4.6" fill="#1a1210"/><ellipse cx="114" cy="98" rx="4" ry="4.6" fill="#1a1210"/>
  <circle cx="87.4" cy="96.6" r="1.3" fill="#fff"/><circle cx="115.4" cy="96.6" r="1.3" fill="#fff"/>
  <path d="M100 100 C98 108 96 112 94 114 C97 116 103 116 106 114" stroke="${shade(skin, -40)}" stroke-width="2" fill="none" stroke-linecap="round"/>
  ${mustache ? MUSTACHE : ''}
  ${smile ? `<path d="M88 130 C94 137 106 137 112 130" stroke="${woman ? '#8a3b3b' : shade(skin, -55)}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<path d="M90 132 L110 132" stroke="${shade(skin, -55)}" stroke-width="3" stroke-linecap="round"/>`}
  ${hair === 'long' ? HAIRSTYLES.long.split('\n')[1] : HAIRSTYLES[hair]}
</svg>`;
}

// ---- Barbers (fictional) ------------------------------------------------------
const SKIN = { wheat: '#c68e5e', tan: '#b07446', brown: '#9a6238', deep: '#7c4a29', honey: '#c48a58', bronze: '#a96d3f' };
const barbers = {
  'arjun-mehta': { skin: SKIN.tan, hair: 'quiff', beard: 'boxed', mustache: true, shirt: '#1d1d22' },
  'vikram-singh': { skin: SKIN.bronze, hair: 'turban', beard: 'full', mustache: true, shirt: '#22303f', accent: '#e0b86a' },
  'priya-sharma': { skin: SKIN.honey, hair: 'long', woman: true, earrings: true, shirt: '#3b1f2b', accent: '#e7a8b8', bg: ['#2d2228', '#17141a'] },
  'rohan-das': { skin: SKIN.brown, hair: 'fade', beard: 'stubble', shirt: '#1f2a24', accent: '#7fc8a9' },
  'karthik-iyer': { skin: SKIN.deep, hair: 'sidepart', beard: 'none', mustache: true, shirt: '#2a2420' },
  'imran-khan': { skin: SKIN.wheat, hair: 'waves', beard: 'full', shirt: '#26222e', accent: '#a99be0' },
};
for (const [name, opts] of Object.entries(barbers)) writeFileSync(join(root, 'barbers', `${name}.svg`), portrait(opts));

// ---- Before / after gallery ----------------------------------------------------
const gallery = [
  ['skin-fade', { skin: SKIN.tan, hair: 'messy', beard: 'stubble', smile: false }, { skin: SKIN.tan, hair: 'fade', beard: 'stubble' }],
  ['beard-sculpt', { skin: SKIN.brown, hair: 'sidepart', beard: 'full', smile: false }, { skin: SKIN.brown, hair: 'sidepart', beard: 'goatee', mustache: true }],
  ['textured-crop', { skin: SKIN.wheat, hair: 'messy', smile: false }, { skin: SKIN.wheat, hair: 'quiff', beard: 'stubble' }],
  ['classic-side-part', { skin: SKIN.deep, hair: 'waves', smile: false }, { skin: SKIN.deep, hair: 'sidepart', mustache: true }],
  ['clean-buzz', { skin: SKIN.bronze, hair: 'messy', beard: 'full', smile: false }, { skin: SKIN.bronze, hair: 'buzz', beard: 'boxed' }],
  ['wavy-taper', { skin: SKIN.honey, hair: 'messy', smile: false }, { skin: SKIN.honey, hair: 'waves', beard: 'stubble' }],
];
for (const [slug, before, after] of gallery) {
  writeFileSync(join(root, 'gallery', `${slug}-before.svg`), portrait({ ...before, bg: ['#3a3a40', '#222226'], shirt: '#55555c', accent: '#999' }));
  writeFileSync(join(root, 'gallery', `${slug}-after.svg`), portrait({ ...after, bg: ['#2b2620', '#15130f'] }));
}

// ---- Hero art: barber at work ------------------------------------------------------
const heroFace = portrait({ ...barbers['arjun-mehta'], bg: ['#2b2620', '#121214'] })
  .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img">', '').replace('</svg>', '');
writeFileSync(join(root, 'hero.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img">
  <defs><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2620"/><stop offset="1" stop-color="#0d0d0f"/></linearGradient>
  <pattern id="tile" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M0 40 L40 0" stroke="#d4a24c" stroke-opacity=".06" stroke-width="2"/></pattern>
  <clipPath id="arch"><rect x="70" y="40" width="260" height="300" rx="130"/></clipPath></defs>
  <rect width="400" height="500" fill="url(#h)"/><rect width="400" height="500" fill="url(#tile)"/>
  <rect x="70" y="40" width="260" height="300" rx="130" fill="#1a1a1e" stroke="#d4a24c" stroke-opacity=".5" stroke-width="4"/>
  <g clip-path="url(#arch)"><g transform="translate(50 50) scale(1.5)">${heroFace}</g></g>
  <rect x="70" y="40" width="260" height="300" rx="130" fill="none" stroke="#d4a24c" stroke-opacity=".5" stroke-width="4"/>
  <g transform="translate(280 300) rotate(-35)" fill="none" stroke="#d4a24c" stroke-width="6" stroke-linecap="round">
    <circle cx="0" cy="40" r="14"/><circle cx="34" cy="40" r="14"/><path d="M8 28 L44 -40 M26 28 L-10 -40"/></g>
  <rect x="40" y="360" width="320" height="10" rx="5" fill="#d4a24c" opacity=".35"/>
</svg>`);

console.log('✔ Illustrations written to client/public/images');
