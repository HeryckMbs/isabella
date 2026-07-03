import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const selectionPath = path.join(root, 'src/content/photo-selection.json');
const outputDir = path.join(root, 'public/gallery');
const runtimeManifestPath = path.join(outputDir, 'photo-manifest.json');

const raw = await fs.readFile(selectionPath, 'utf8');
const selection = JSON.parse(raw);

await fs.mkdir(outputDir, { recursive: true });

const manifest = [];

for (const item of selection) {
  const input = path.join(root, item.source);
  const exists = await fs
    .access(input)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    console.warn(`[optimize-photos] missing source: ${item.source}`);
    continue;
  }

  const safeId = item.id.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
  const largeName = `${safeId}-large.webp`;
  const thumbName = `${safeId}-thumb.webp`;
  const largePath = path.join(outputDir, largeName);
  const thumbPath = path.join(outputDir, thumbName);

  const image = sharp(input, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();

  await image
    .clone()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 })
    .toFile(largePath);

  await image
    .clone()
    .resize({ width: 360, height: 360, fit: 'cover', position: 'attention' })
    .webp({ quality: 70, effort: 5 })
    .toFile(thumbPath);

  manifest.push({
    id: item.id,
    caption: item.caption,
    year: item.year,
    featured: Boolean(item.featured),
    puzzle: Boolean(item.puzzle),
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    src: `gallery/${largeName}`,
    thumb: `gallery/${thumbName}`
  });
}

if (manifest.length === 0) {
  const existingManifest = await fs
    .access(runtimeManifestPath)
    .then(() => true)
    .catch(() => false);

  if (existingManifest) {
    console.warn('[optimize-photos] no local originals found; preserving existing public/gallery manifest');
    process.exit(0);
  }
}

await fs.writeFile(runtimeManifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), photos: manifest }, null, 2)}\n`);

console.log(`[optimize-photos] wrote ${manifest.length} photos to ${path.relative(root, outputDir)}`);
