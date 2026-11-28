import { useState } from 'react';
import { Link, rememberedSeason } from '../lib/router.jsx';
import { useApi } from '../lib/useApi.js';
import { carFor, posterFor } from '../lib/teams.js';
import { fmtNum } from '../lib/format.js';
import { useDriverPhotos } from '../lib/photos.js';
import '../seasonPicker.css';


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
  const champ = season.driversChampion;
  const cons = season.constructorsChampion;
  const car = cons && carFor(cons.team, season.year);
  return (
    <Link
      raw
      to={`/${season.year}`}
      className={`season-btn ${hover ? 'is-hot' : ''}`}
      style={{ '--champ': cons?.teamColor || champ?.teamColor || 'var(--flag)' }}
      onMouseEnter={() => { setHover(true); }}
      onMouseLeave={() => setHover(false)}
      onFocus={() => { setHover(true); }}
      onBlur={() => setHover(false)}
    >
      {photo && champ && (
        <figure className="season-photo">
          <img src={`/img/drivers/${photo.file}`} alt={champ.name} loading="lazy" style={photo.head ? { objectPosition: `${photo.head.x}% ${photo.head.y}%` } : undefined} />
          <figcaption>Photo: {photo.author}, {photo.license}</figcaption>
        </figure>
      )}
      <div className="season-car">
        {car?.model && <img className="car-poster" src={posterFor(car.model, 'tq')} alt={`${cons.team} ${car.car}`} width="1144" height="660" decoding="async" />}
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
