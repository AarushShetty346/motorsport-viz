#!/usr/bin/env node
// Downloads a freely licensed photo of every 2025 driver from Wikimedia Commons
// into web/public/img/drivers/ and writes credits.json.
//
// Only CC BY, CC BY-SA, CC0 and public-domain images are kept, and each one's
// author, licence and source page go into credits.json so the site can credit it.
//
// Usage:  npm run photos:fetch            (skips drivers that already have a photo)
//         npm run photos:fetch -- --force (fetches them all again)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'web/public/img/drivers');
const creditsPath = join(outDir, 'credits.json');
const force = process.argv.includes('--force');
const UA = 'LapByLap/1.0 (https://github.com/aarushshetty346/motorsport-viz)';

// Wikipedia article titles that don't follow "First_Last".
const TITLES = {
  'kimi-antonelli': 'Andrea_Kimi_Antonelli',
  'george-russell': 'George_Russell_(racing_driver)',
  'alexander-albon': 'Alexander_Albon',
  'carlos-sainz-jr': 'Carlos_Sainz_Jr.',
  'oliver-bearman': 'Oliver_Bearman',
  'jack-doohan': 'Jack_Doohan',
  'liam-lawson': 'Liam_Lawson',
};
// Drivers whose article lead image can't be reused: a freely licensed Commons file to use instead.
const FILES = {
  'lewis-hamilton': 'Lewis Hamilton 2016 Malaysia 2.jpg',
};
const OK_LICENCE = /^(cc[- ]by(-sa)?[- ][\d.]+|cc0|public domain|pd)/i;

const season = JSON.parse(gunzipSync(readFileSync(join(root, 'data/season-2025.json.gz'))));
mkdirSync(outDir, { recursive: true });
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : {};

const get = async (url, as = 'json') => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
};
const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const reusable = (ii) => OK_LICENCE.test(strip(ii?.extmetadata?.LicenseShortName?.value));
const credit = (ii, file) => ({
  file,
  author: strip(ii.extmetadata?.Artist?.value) || 'Unknown author',
  license: strip(ii.extmetadata?.LicenseShortName?.value),
  sourceUrl: ii.descriptionurl,
});

for (const d of season.drivers) {
  const key = d.key;
  const havePhoto = !force && credits[key]?.file && existsSync(join(outDir, credits[key].file));
  if (havePhoto) console.log(`·  ${key}: already have the photo`);
  else try {
    let fileName = FILES[key];
    if (!fileName) {
      const title = TITLES[key] || `${d.firstName}_${d.lastName}`.replace(/ /g, '_');
      const summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      const original = summary.originalimage?.source;
      if (!original) throw new Error('article has no lead image');
      fileName = decodeURIComponent(original.split('?')[0].split('/').pop());
    }

    const info = await get(
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo' +
      `&iiprop=url|extmetadata&iiurlwidth=900&titles=${encodeURIComponent('File:' + fileName)}`,
    );
    const page = Object.values(info.query?.pages || {})[0];
    const ii = page?.imageinfo?.[0];
    if (!ii) throw new Error(`no Commons record for ${fileName}`);
    const meta = ii.extmetadata || {};
    const licence = strip(meta.LicenseShortName?.value);
    if (!OK_LICENCE.test(licence)) throw new Error(`licence "${licence}" isn't one we can reuse`);

    const file = `${key}.jpg`;
    writeFileSync(join(outDir, file), await get(ii.thumburl || ii.url, 'buffer'));
    credits[key] = {
      ...(credits[key] || {}),
      ...credit(ii, file),
    };
    console.log(`✓  ${key}: ${fileName} (${licence})`);
  } catch (err) {
    console.log(`✗  ${key}: ${err.message}`);
  }

  await new Promise((r) => setTimeout(r, 400)); // be polite to the APIs
}

writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');
console.log(`\nWrote ${creditsPath}`);
