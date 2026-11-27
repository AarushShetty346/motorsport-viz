import { MODEL_CREDITS } from '../lib/modelCredits.js';

const LICENCE = 'https://creativecommons.org/licenses/by/4.0/';

// Who made the data, photos and 3D models the site is built on.
export default function Credits() {
  return (
    <section className="page container me-page privacy-page credits-page">
      <p className="eyebrow">Credits</p>
      <h1 className="display-xl">Built on open work</h1>
      <p className="lede">Lap by Lap is an unofficial fan project. Everything below is used under its own licence.</p>

      <h2 className="h-small">Data</h2>
      <ul>
        <li>Results, calendars, circuits and drivers: <a href="https://github.com/f1db/f1db">F1DB</a> (CC BY 4.0).</li>
        <li>Laps and telemetry: <a href="https://github.com/TracingInsights/2024">TracingInsights 2024</a> and <a href="https://github.com/TracingInsights/2025">2025</a> (Apache-2.0), from the official live-timing feed via <a href="https://github.com/theOehrly/Fast-F1">FastF1</a>.</li>
        <li>Driver and podium photos: Wikimedia Commons, credited under each photo.</li>
      </ul>

      <h2 className="h-small">3D car models</h2>
      <p>
        From Sketchfab under <a href={LICENCE}>CC BY 4.0</a>. They were compressed and simplified so they load quickly,
        and the 2024 McLaren was painted because the original has no textures. Teams without a model of their own car use the closest one available, as noted on the Teams page.
      </p>
      <ul className="credits-list">
        {MODEL_CREDITS.map((m) => (
          <li key={m.file}>
            <a href={m.url}>{m.title}</a> by {m.author}
          </li>
        ))}
      </ul>
    </section>
  );
}
