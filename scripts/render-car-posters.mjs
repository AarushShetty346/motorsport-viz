// Renders a still picture of every car model into web/public/img/cars, so the Teams page and
// the season picker can show the cars without loading three.js or the models.
// Run after changing a model (needs Playwright's Chromium): node scripts/render-car-posters.mjs
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('..', import.meta.url).pathname;
const out = `${root}web/public/img/cars`;
mkdirSync(out, { recursive: true });

// Repaints from web/src/lib/teams.js, e.g. model: '2024-alpine', paint: { paints: '#14325e' }
const teams = readFileSync(`${root}web/src/lib/teams.js`, 'utf8');
const paints = {};
for (const m of teams.matchAll(/model: '([\w-]+)', paint: (\{[^}]*\})/g)) paints[m[1]] = m[2].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');

// Sizes are twice what the pages show: Teams cards are about 560 x 150, picker cars 570 x 330.
const views = { side: [1120, 300], tq: [1144, 660] };

const server = await createServer({ configFile: `${root}vite.config.mjs`, server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
for (const f of readdirSync(`${root}web/public/models`).filter((x) => x.endsWith('.glb'))) {
  const name = f.replace('.glb', '');
  for (const [view, [w, h]] of Object.entries(views)) {
    const q = new URLSearchParams({ file: `/models/${f}`, view, w, h, ...(paints[name] && { paint: paints[name] }) });
    await page.goto(`http://localhost:5199/poster.html?${q}`);
    await page.waitForSelector('.car-model.is-ready', { timeout: 120000 });
    const url = await page.evaluate(() => document.querySelector('.car-model canvas').toDataURL('image/webp', 0.85));
    const buf = Buffer.from(url.split(',')[1], 'base64');
    writeFileSync(`${out}/${name}-${view}.webp`, buf);
    console.log(`${name}-${view}.webp ${Math.round(buf.length / 1024)} KB`);
  }
}
await browser.close();
await server.close();
