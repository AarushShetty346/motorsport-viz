#!/usr/bin/env node
// Downloads a freely licensed photo of every 2025 car from Wikimedia Commons into
// web/public/img/cars/ and writes credits.json next to them. The team pages show it
// under "Real car", next to the animated car.
//
// Only CC BY, CC BY-SA, CC0 and public-domain images are kept, and each one's
// author, licence and source page go into credits.json so the site can credit it.
//
// Usage:  npm run cars:fetch            (skips teams that already have a photo)
//         npm run cars:fetch -- --force (fetches them all again)
//
// A real 3D model can be used instead of a photo: put a .glb (or .gltf) file in
// web/public/img/cars/ and add "model": "<file>" to that team's entry in credits.json,
// with "modelAuthor", "modelLicense" and "modelSourceUrl" for the credit. If the car
// faces the wrong way, set "modelRotate" to 180 (degrees).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'web/public/img/cars');
const creditsPath = join(outDir, 'credits.json');
const force = process.argv.includes('--force');
const UA = 'LapByLap/1.0 (https://github.com/aarushshetty346/motorsport-viz)';

// Team key -> the car's Wikipedia article, plus a Commons search used when the
// article has no reusable lead image.
const CARS = {
  mclaren: ['McLaren_MCL39', 'McLaren MCL39'],
  ferrari: ['Ferrari_SF-25', 'Ferrari SF-25'],
  'red-bull-racing': ['Red_Bull_RB21', 'Red Bull RB21'],
  mercedes: ['Mercedes-AMG_F1_W16_E_Performance', 'Mercedes W16 2025'],
  'aston-martin': ['Aston_Martin_AMR25', 'Aston Martin AMR25'],
  alpine: ['Alpine_A525', 'Alpine A525'],
  williams: ['Williams_FW47', 'Williams FW47'],
  'racing-bulls': ['Racing_Bulls_VCARB_02', 'VCARB 02'],
  'kick-sauber': ['Kick_Sauber_C45', 'Sauber C45'],
  'haas-f1-team': ['Haas_VF-25', 'Haas VF-25'],
};
const OK_LICENCE = /^(cc[- ]by(-sa)?[- ][\d.]+|cc0|public domain|pd)/i;

mkdirSync(outDir, { recursive: true });
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : {};

const get = async (url, as = 'json') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
};
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const commons = (params) => get(`https://commons.wikimedia.org/w/api.php?format=json&${params}`);

// Licence and download details for one Commons file, or null if it can't be reused.
async function fileInfo(fileName) {
  const info = await commons(`action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent('File:' + fileName)}`);
  const ii = Object.values(info.query?.pages || {})[0]?.imageinfo?.[0];
  if (!ii) return null;
  const meta = ii.extmetadata || {};
  const licence = strip(meta.LicenseShortName?.value);
  if (!OK_LICENCE.test(licence)) return null;
  return { url: ii.thumburl || ii.url, author: strip(meta.Artist?.value) || 'Unknown author', license: licence, sourceUrl: ii.descriptionurl, fileName };
}

async function findPhoto([article, search]) {
  try {
    const summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`);
    const lead = summary.originalimage?.source;
    if (lead) {
      const found = await fileInfo(decodeURIComponent(lead.split('?')[0].split('/').pop()));
      if (found) return found;
    }
  } catch {
    // No article yet; fall through to a Commons search.
  }
  const hits = await commons(`action=query&list=search&srnamespace=6&srlimit=10&srsearch=${encodeURIComponent(search + ' filetype:bitmap')}`);
  for (const hit of hits.query?.search || []) {
    const found = await fileInfo(hit.title.replace(/^File:/, ''));
    if (found) return found;
  }
  throw new Error(`no freely licensed photo found (searched "${search}")`);
}

for (const [key, names] of Object.entries(CARS)) {
  if (!force && credits[key]?.photo && existsSync(join(outDir, credits[key].photo))) {
    console.log(`·  ${key}: already have it`);
    continue;
  }
  try {
    const found = await findPhoto(names);
    const photo = `${key}.jpg`;
    writeFileSync(join(outDir, photo), await get(found.url, 'buffer'));
    credits[key] = { ...credits[key], photo, author: found.author, license: found.license, sourceUrl: found.sourceUrl };
    console.log(`✓  ${key}: ${found.fileName} (${found.license})`);
  } catch (err) {
    console.log(`✗  ${key}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // be polite to the APIs
}

writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');
console.log(`\nWrote ${creditsPath}. Check each photo shows the right car before you commit it.`);
