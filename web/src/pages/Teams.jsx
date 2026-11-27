import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { useDriverPhotos } from '../lib/photos.js';
import { lazy, Suspense } from 'react';
import { Link, useRouter } from '../lib/router.jsx';
import { teamInfo, teamPath } from '../lib/teams.js';
import '../carShowcase.css';

const CarModel = lazy(() => import('../components/CarModel.jsx'));
import DriverPortrait from '../components/DriverPortrait.jsx';

// Every team of the season in championship order, each with its car and its drivers.
export default function Teams() {
  const { drivers, ready } = useSeason();
  const constructors = useApi('/api/season/constructors');
  const photos = useDriverPhotos();
  const { season } = useRouter();
  if (!ready || !constructors.data) return <div className="page" />;
  const list = constructors.data.results || [];

  return (
    <section className="page container teams-page">
      <h1 className="display-xl">Teams</h1>
      <p className="lede">All ten {season} teams, in constructors' championship order.</p>
      <ol className="teams-grid">
        {list.map((t, i) => {
          const crew = drivers.filter((d) => d.team === t._id);
          const color = crew[0]?.teamColor || '#888888';
          const info = teamInfo(t._id, color);
          return (
            <li key={t._id} className="teams-card" style={{ '--team': color }}>
              <Link to={teamPath(t._id)} className="teams-card-link">
                <div className="teams-card-head">
                  <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                  <h2 className="display-sm">{t._id}</h2>
                  <span className="mono">{t.points} pts</span>
                </div>
                {info.model && (
                  <Suspense fallback={<div className="car-model" />}>
                    <CarModel model={info.model} spin={0} view="side" label={`${t._id} ${info.car}, 3D model`} />
                  </Suspense>
                )}
                <p className="teams-card-car mono">{info.car}{info.engine ? `, ${info.engine} power` : ''}</p>
              </Link>
              <ul className="teams-card-drivers">
                {crew.map((d) => (
                  <li key={d.key}>
                    <Link to={`/driver/${d.key}`}>
                      <DriverPortrait driver={d} photo={photos[d.key]} small />
                      <span>{d.firstName} <strong>{d.lastName}</strong></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
