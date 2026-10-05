import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap } from '../lib/format.js';
import { EASE_OUT } from '../lib/motion.js';
import { lapTags } from '../lib/steward.js';
import JsonView from './JsonView.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';

// Any lap on the site can be opened here with openLap(id).
let current = null;
const listeners = new Set();
export function openLap(id) {
  current = id;
  listeners.forEach((fn) => fn());
}
const closeLap = () => openLap(null);

export default function LapDrawer() {
  const id = useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => current);
  useEffect(() => {
    if (!id) return;
    const onKey = (e) => e.key === 'Escape' && closeLap();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [id]);

  return (
    <AnimatePresence>
      {id && (
        <motion.div className="drawer-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} onMouseDown={closeLap}>
          <motion.aside
            className="drawer"
            role="dialog"
            aria-label="Lap document"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.22, ease: EASE_OUT } }}
            exit={{ x: 24, opacity: 0, transition: { duration: 0.12 } }}
            onMouseDown={(e) => e.stopPropagation()}
            data-lenis-prevent
          >
            <LapDocument id={id} />
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LapDocument({ id }) {
  const { driverById, raceByRound } = useSeason();
  const { data, error } = useApi(`/api/laps/${id}`);
  const lap = data?.lap;
  const driver = lap && driverById.get(lap.driverId);
  const race = lap && raceByRound.get(lap.round);
  return (
    <>
      <div className="drawer-head">
        <div>
          <p className="eyebrow">laps document</p>
          <h2 className="h-small">{lap ? `${driver?.name ?? 'Unknown driver'} · lap ${lap.lapNumber}` : 'Loading…'}</h2>
          {lap && <p className="muted small">{race?.name} · {fmtLap(lap.lapTime)}{lapTags(lap).map((t) => <span key={t} className={`lap-tag ${t}`}>({t})</span>)}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={closeLap}>Close</button>
      </div>
      {error && <p className="msg msg-err">{error.message}</p>}
      {lap && (
        <>
          <div className="legend small">
            <span><span className="sw sw-embed" />Embedded (stored inside this document)</span>
            <span><span className="sw sw-ref" />Reference (click to open)</span>
          </div>
          <JsonView
            value={lap}
            embed={['telemetry', 'sectors']}
            refs={['driverId', 'raceId']}
            links={{ driverId: driver && `/driver/${driver.key}`, raceId: race && `/race/${race.round}` }}
            onNavigate={closeLap}
          />
          <p className="small muted">
            <code>telemetry</code> and <code>sectors</code> belong to this lap only, so they are embedded and come back in the same read.{' '}
            <code>driverId</code> and <code>raceId</code> point to documents in the <code>drivers</code> and <code>races</code> collections, which many laps share.
          </p>
          <FeatureLabel name="Embedded documents + referencing" />
          <Query text={data.query} />
        </>
      )}
    </>
  );
}
