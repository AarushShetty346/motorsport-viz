import { useMemo } from 'react';
import { useSeason } from '../lib/season.jsx';
import { useApi } from '../lib/useApi.js';
import { useRouter } from '../lib/router.jsx';
import { fmtLap } from '../lib/format.js';
import DriverName from '../components/DriverName.jsx';
import Query from '../components/Query.jsx';
import Band from '../components/Band.jsx';
import FeatureLabel from '../components/FeatureLabel.jsx';

export default function Compare() {
  const { standings, driverByKey, drivers, ready } = useSeason();
  const { query, navigate } = useRouter();
  const aKey = query.get('a') || standings[0]?.key;
  const bKey = query.get('b') || standings.find((s) => s.key !== aKey)?.key;
  const A = driverByKey.get(aKey);
  const B = driverByKey.get(bKey);
  const same = A && B && A._id === B._id;
  const { data, error } = useApi(A && B && !same ? `/api/user/compare?a=${A._id}&b=${B._id}` : null);

  const setSide = (side, key) => {
    const p = new URLSearchParams({ a: aKey, b: bKey, [side]: key });
    navigate(`/compare?${p}`, { replace: true });
  };
  const swap = () => navigate(`/compare?a=${bKey}&b=${aKey}`, { replace: true });

  const perRace = useMemo(() => {
    if (!data) return [];
    const [a, b] = data.results;
    const bMap = new Map((b.stats?.perRace || []).map((r) => [r.round, r]));
    return (a.stats?.perRace || []).filter((r) => bMap.has(r.round)).map((r) => ({ ...r, b: bMap.get(r.round), delta: r.avgLapTime - bMap.get(r.round).avgLapTime }));
  }, [data]);

  if (!ready) return <div className="page" />;
  const sorted = [...drivers].sort((x, y) => x.lastName.localeCompare(y.lastName));
  const picker = (side, value) => (
    <label className="select big">
      <span className="sr-only">Driver {side.toUpperCase()}</span>
      <select value={value || ''} onChange={(e) => setSide(side, e.target.value)}>
        {sorted.map((d) => <option key={d.key} value={d.key}>{d.name} · {d.team}</option>)}
      </select>
    </label>
  );

  const [ra, rb] = data?.results || [];
  const avgA = ra?.stats?.avgLapTime, avgB = rb?.stats?.avgLapTime;
  const aheadA = data?.duel.filter((d) => d.a.position && (!d.b.position || d.a.position < d.b.position)).length ?? 0;
  const aheadB = data?.duel.filter((d) => d.b.position && (!d.a.position || d.b.position < d.a.position)).length ?? 0;
  const likeForLikeA = perRace.filter((r) => r.delta < 0).length;
  const maxDelta = Math.max(0.2, ...perRace.map((r) => Math.min(3, Math.abs(r.delta))));

  return (
    <article className="page band-page compare-page">
      <Band className="compare-band">
        <p className="band-meta">Head to head · 2025 season</p>
        <h1 className="display-xl">Who was<br />quicker?</h1>
        <p className="lede">Racing laps only: no opening lap and no pit laps. Averages are compared race by race so every gap is like for like.</p>
        <div className="h2h-pickers">
          {picker('a', aKey)}
          <button type="button" className="btn btn-ghost swap" onClick={swap} aria-label="Swap drivers">⇄</button>
          {picker('b', bKey)}
        </div>
      </Band>
      <div className="container compare-body">

      {same && <p className="msg msg-err">Pick two different drivers.</p>}
      {error && <p className="msg msg-err">{error.message}</p>}
      {data && (
        <>
          <div className="h2h">
            <SideCard side={ra} other={avgB} races={aheadA} fasterRaces={likeForLikeA} total={perRace.length} />
            <div className="h2h-vs">VS</div>
            <SideCard side={rb} other={avgA} races={aheadB} fasterRaces={perRace.length - likeForLikeA} total={perRace.length} />
          </div>

          <section className="section-tight">
            <h2 className="h-small">Average racing lap, race by race</h2>
            <div className="delta-chart" role="table" aria-label="Average lap time difference per race">
              <div className="delta-head" role="row">
                <span role="columnheader">Race</span>
                <span role="columnheader" className="left-label"><span className="team-bar sm" style={{ background: ra.driver.teamColor }} />{ra.driver.code} quicker</span>
                <span role="columnheader" className="right-label">{rb.driver.code} quicker<span className="team-bar sm" style={{ background: rb.driver.teamColor }} /></span>
                <span role="columnheader" className="num">Gap</span>
              </div>
              {perRace.map((r) => {
                const w = Math.min(3, Math.abs(r.delta)) / maxDelta;
                const aFaster = r.delta < 0;
                return (
                  <div key={r.round} className="delta-row" role="row">
                    <span role="cell" className="delta-race">{r.race.replace(' Grand Prix', '')}</span>
                    <span role="cell" className="delta-half left">{aFaster && <span className="delta-bar" style={{ transform: `scaleX(${w})`, background: ra.driver.teamColor }} />}</span>
                    <span role="cell" className="delta-half right">{!aFaster && <span className="delta-bar" style={{ transform: `scaleX(${w})`, background: rb.driver.teamColor }} />}</span>
                    <span role="cell" className="num mono small" title={`${fmtLap(r.avgLapTime)} vs ${fmtLap(r.b.avgLapTime)}`}>{Math.abs(r.delta).toFixed(3)}s</span>
                  </div>
                );
              })}
              {!perRace.length && <p className="muted">These two never raced in the same Grand Prix.</p>}
            </div>
          </section>

          {!!data.duel.length && (
            <section className="section-tight">
              <h2 className="h-small">Finishing order when both started</h2>
              <div className="duel-strip">
                {data.duel.map((d) => {
                  const aWon = d.a.position && (!d.b.position || d.a.position < d.b.position);
                  const bWon = d.b.position && (!d.a.position || d.b.position < d.a.position);
                  return (
                    <span key={d.round} className="duel-cell" style={{ background: aWon ? ra.driver.teamColor : bWon ? rb.driver.teamColor : 'var(--surface-2)' }} title={`${d.name}: ${ra.driver.code} ${d.a.position ?? d.a.positionText} · ${rb.driver.code} ${d.b.position ?? d.b.positionText}`}>
                      <span className="mono">{aWon ? ra.driver.code : bWon ? rb.driver.code : '–'}</span>
                    </span>
                  );
                })}
              </div>
            </section>
          )}
          <FeatureLabel name="Head-to-head comparison" type="user" />
          <Query text={data.query} />
        </>
      )}
      </div>
    </article>
  );
}

function SideCard({ side, other, races, fasterRaces, total }) {
  const avg = side.stats?.avgLapTime;
  const diff = typeof avg === 'number' && typeof other === 'number' ? avg - other : null;
  return (
    <div className="h2h-card" style={{ '--team': side.driver.teamColor }}>
      <DriverName driver={side.driver} />
      <p className="h2h-big mono">{fmtLap(avg)}</p>
      <p className="muted small">average racing lap over {side.stats?.laps ?? 0} laps</p>
      {diff !== null && (
        <p className={`verdict ${diff < 0 ? 'faster' : diff > 0 ? 'slower' : ''}`}>
          {diff === 0 ? 'Dead level' : diff < 0 ? `Quicker by ${Math.abs(diff).toFixed(3)}s a lap` : `Slower by ${diff.toFixed(3)}s a lap`}
        </p>
      )}
      <div className="h2h-counts">
        <div><span className="mono">{fasterRaces}/{total}</span><span className="muted small">races with the quicker average</span></div>
        <div><span className="mono">{races}</span><span className="muted small">times finished ahead</span></div>
      </div>
    </div>
  );
}
