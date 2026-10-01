import { useEffect, useState } from 'react';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtNum } from '../lib/format.js';
import { Link } from '../lib/router.jsx';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';

// Laps whose top speed beat a threshold: a dot-notation query on the embedded telemetry.
export default function SpeedTrap({ round, defaultMin = 340, title = 'Speed trap', num, compact = false }) {
  const { driverById, raceByRound } = useSeason();
  const [min, setMin] = useState(defaultMin);
  const [debounced, setDebounced] = useState(defaultMin);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(min), 180);
    return () => clearTimeout(t);
  }, [min]);
  const { data, error } = useApi(`/api/user/speed?min=${debounced}&limit=${compact ? 8 : 12}${round ? `&round=${round}` : ''}`);

  return (
    <div className="speed-trap">
      <div className="speed-head">
        <div>
          <p className="eyebrow">{num && <span className="num">{num}</span>}{title}</p>
          <p className="speed-count">
            <span className="display-md mono">{data ? fmtNum(data.total) : '—'}</span>
            <span className="muted">laps faster than <strong className="ink">{min} km/h</strong>{round ? ' in this race' : ' all season'}</span>
          </p>
        </div>
        <label className="slider">
          <span className="sr-only">Minimum top speed</span>
          <input type="range" min={round ? 280 : 300} max={370} step="1" value={min} onChange={(e) => setMin(Number(e.target.value))} />
          <span className="slider-scale mono muted"><span>{round ? 280 : 300}</span><span>370 km/h</span></span>
        </label>
      </div>
      {error && <p className="msg msg-err">{error.message}</p>}
      <ol className="speed-list">
        {data?.results.map((l, i) => {
          const race = raceByRound.get(l.round);
          return (
            <li key={l._id}>
              <span className="pos mono">{i + 1}</span>
              <DriverName driver={driverById.get(l.driverId)} short={compact} sub={round ? `Lap ${l.lapNumber}` : undefined} />
              {!round && <Link className="speed-race" to={`/race/${l.round}`}>{race?.shortName} · lap {l.lapNumber}</Link>}
              <span className="mono muted">{fmtLap(l.lapTime)}</span>
              <span className="speed-value mono">{fmtNum(l.telemetry.speed, 1)}<small> km/h</small></span>
            </li>
          );
        })}
      </ol>
      {data && data.total === 0 && <p className="muted">Nobody went that fast. Try a lower threshold.</p>}
      <Query text={data?.query} />
    </div>
  );
}
