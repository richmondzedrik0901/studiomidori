/**
 * scripts/optimize-images.mjs – Studio Midori image optimizer
 *
 * Generates web-optimized copies of the brand images into /public so they are
 * served at stable root URLs (needed for PWA icons and Open Graph previews).
 * The original source images in the project root are left untouched.
 *
 * Usage:  npm run optimize:images
 */

import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');
const BRAND_BG = '#fefcf5'; // --white in style.css

const src = (f) => resolve(ROOT, f);
const out = (f) => resolve(PUBLIC, f);

async function kb(file) {
  return `${((await stat(file)).size / 1024).toFixed(0)} KB`;
}

async function job(label, input, output, pipeline) {
  await mkdir(dirname(output), { recursive: true });
  await pipeline(sharp(input)).toFile(output);
  console.log(`  ✓ ${label.padEnd(26)} ${await kb(input)} → ${await kb(output)}`);
}

console.log('🍵 Optimizing Studio Midori images…\n');

// ── Logo (header) ───────────────────────────────────────────────────
await job('img/logo.webp', src('logo.png'), out('img/logo.webp'),
  (s) => s.resize({ width: 480, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 90 }));
await job('img/logo.png (fallback)', src('logo.png'), out('img/logo.png'),
  (s) => s.resize({ width: 480, withoutEnlargement: true }).png({ compressionLevel: 9, palette: true, quality: 90 }));

// ── GCash QR (keep crisp – lossless) ────────────────────────────────
await job('img/gcash-qr.webp', src('gcash-qr.png'), out('img/gcash-qr.webp'),
  (s) => s.resize({ width: 720, withoutEnlargement: true }).webp({ lossless: true }));
await job('img/gcash-qr.png (fallback)', src('gcash-qr.png'), out('img/gcash-qr.png'),
  (s) => s.resize({ width: 720, withoutEnlargement: true }).png({ compressionLevel: 9 }));

// ── Open Graph / social banner (1200×630 JPG is the most compatible) ─
await job('og-banner.jpg', src('banner.png'), out('og-banner.jpg'),
  (s) => s.resize(1200, 630, { fit: 'cover' }).flatten({ background: BRAND_BG }).jpeg({ quality: 82, mozjpeg: true }));

// ── PWA / app icons (square, padded logo on brand background) ───────
const icon = (size, padRatio) => (s) => {
  const inner = Math.round(size * (1 - padRatio * 2));
  return s
    .resize(inner, inner, { fit: 'contain', background: BRAND_BG })
    .extend({
      top: Math.floor((size - inner) / 2), bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2), right: Math.ceil((size - inner) / 2),
      background: BRAND_BG,
    })
    .flatten({ background: BRAND_BG })
    .png({ compressionLevel: 9 });
};

await job('icons/icon-192.png', src('logo.png'), out('icons/icon-192.png'), icon(192, 0.08));
await job('icons/icon-512.png', src('logo.png'), out('icons/icon-512.png'), icon(512, 0.08));
await job('icons/maskable-512.png', src('logo.png'), out('icons/maskable-512.png'), icon(512, 0.2));
await job('icons/apple-touch-icon.png', src('logo.png'), out('icons/apple-touch-icon.png'), icon(180, 0.1));
await job('favicon-32.png', src('logo.png'), out('favicon-32.png'), icon(32, 0.04));

console.log('\n✅ Done. Optimized files are in /public');
