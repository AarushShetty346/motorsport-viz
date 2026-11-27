import { lazy, Suspense, useState } from 'react';
import { Link, rememberedSeason } from '../lib/router.jsx';
import { useApi } from '../lib/useApi.js';
import { carFor } from '../lib/teams.js';
import { fmtNum } from '../lib/format.js';
import { useDriverPhotos } from '../lib/photos.js';
import '../seasonPicker.css';

// three.js only downloads once the picker is on screen.
const CarModel = lazy(() => import('./CarModel.jsx'));

// One button per season, showing the drivers' champion. Hovering paints it in the
// constructors' champion's colour and swaps the photo for their car.
export default function SeasonPicker() {
  const { data } = useApi('/api/seasons');
  const last = rememberedSeason();
  const photos = useDriverPhotos();
  return (
    <section id="seasons" className="season-picker container section">
      <p className="eyebrow mono">Choose a season</p>
      <h2 className="display-md">Which year do you want to relive?</h2>
      <div className="season-grid">
        {(data?.seasons || []).map((s) => <SeasonButton key={s.year} season={s} last={last === s.year} photo={photos[s.driversChampion?.key]} />)}
      </div>
    </section>
  );
}

function SeasonButton({ season, last, photo }) {
  const [hover, setHover] = useState(false);
  const [seen, setSeen] = useState(false); // load the 3D car on first hover only
  const champ = season.driversChampion;
  const cons = season.constructorsChampion;
  const car = cons && carFor(cons.team, season.year);
  return (
    <Link
      raw
      to={`/${season.year}`}
      className={`season-btn ${hover ? 'is-hot' : ''}`}
      style={{ '--champ': cons?.teamColor || champ?.teamColor || 'var(--flag)' }}
      onMouseEnter={() => { setHover(true); setSeen(true); }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => { setHover(true); setSeen(true); }}
      onBlur={() => setHover(false)}
    >
      {photo && champ && (
        <figure className="season-photo">
          <img src={`/img/drivers/${photo.file}`} alt={champ.name} loading="lazy" style={photo.head ? { objectPosition: `${photo.head.x}% ${photo.head.y}%` } : undefined} />
          <figcaption>Photo: {photo.author}, {photo.license}</figcaption>
        </figure>
      )}
      <div className="season-car">
        {car?.model && seen && (
          <Suspense fallback={null}>
            <CarModel model={car.model} distance={1.25} spin={0.8} label={`${cons.team} ${car.car}`} />
          </Suspense>
        )}
      </div>
      <span className="season-year">{season.year}</span>
      <span className="season-meta mono">
        {champ && <span>Champion <b>{champ.name}</b> · {champ.team}</span>}
        {cons && <span>Constructors <b>{cons.team}</b>{car?.car ? ` · ${car.car}` : ''}</span>}
        <span>{season.races} Grands Prix · {fmtNum(season.laps)} laps</span>
      </span>
      {last && <span className="season-last mono">Last viewed</span>}
    </Link>
  );
}
