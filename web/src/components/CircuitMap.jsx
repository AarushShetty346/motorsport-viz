import { useState } from 'react';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { Link, useRouter } from '../lib/router.jsx';
import Flag from './Flag.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';

const W = 1000, H = 440;
// Plain equirectangular projection, cropped to where the calendar goes (60°N to 45°S).
const x = (lng) => ((lng + 180) / 360) * W;
const y = (lat) => ((60 - lat) / 105) * H;

// Every circuit of the season, placed by its GeoJSON point in the circuits collection.
export function CircuitMap() {
  const circuits = useApi('/api/circuits');
  const { navigate } = useRouter();
  const [hover, setHover] = useState(null);
  const placed = (circuits.data?.results || []).filter((r) => r.location);
  const route = placed.map((r, i) => `${i ? 'L' : 'M'}${x(r.location.coordinates[0]).toFixed(1)},${y(r.location.coordinates[1]).toFixed(1)}`).join('');
  return (
    <section className="section container" id="map">
      <div className="section-head">
        <p className="eyebrow">Circuit map</p>
        <h2 className="display-lg">Where they raced</h2>
      </div>
      <figure className="chart circuit-map">
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the 24 circuits">
            {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((l) => <line key={l} className="map-grid" x1={x(l)} x2={x(l)} y1={0} y2={H} />)}
            {[45, 30, 15, 0, -15, -30].map((l) => <line key={l} className={`map-grid ${l === 0 ? 'equator' : ''}`} x1={0} x2={W} y1={y(l)} y2={y(l)} />)}
            <path d={route} className="map-route" />
            {placed.map((r) => {
              const [lng, lat] = r.location.coordinates;
              return (
                <g key={r.round} className="map-pin" onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} onClick={() => navigate(`/race/${r.round}`)}>
                  <circle cx={x(lng)} cy={y(lat)} r={hover === r ? 8 : 5} />
                  <text x={x(lng) + 8} y={y(lat) - 6} className="axis">{r.round}</text>
                  <title>{`Round ${r.round}: ${r.name} (${r.circuit})`}</title>
                </g>
              );
            })}
          </svg>
        </div>
        <figcaption className="muted small">{hover ? `Round ${hover.round} · ${hover.name} · ${hover.circuit}` : 'The line follows the calendar order. Click a circuit to open its race.'}</figcaption>
      </figure>
      <FeatureLabel name="Geospatial: GeoJSON points + 2dsphere index" />
      <Query text={circuits.data?.query} />
    </section>
  );
}

// The five circuits closest to this one ($geoNear).
export function NearbyCircuits({ round }) {
  const { data, error } = useApi(`/api/races/${round}/nearby`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  return (
    <div className="nearby">
      <h3 className="h-small">Nearby circuits</h3>
      <ol className="movers-list">
        {data?.results.map((r) => (
          <li key={r.round}>
            <Link to={`/race/${r.round}`}><Flag code={r.countryCode} /> {r.circuit} <span className="muted small">R{r.round}</span></Link>
            <span className="mono small">{r.distanceKm.toLocaleString('en-GB')} km</span>
          </li>
        ))}
      </ol>
      <FeatureLabel name="Geospatial: $geoNear on a 2dsphere index" />
      <Query text={data?.query} explain={data?.explain} />
    </div>
  );
}
