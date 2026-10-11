import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { useDisplayName } from '../lib/displayName.js';
import { Link } from '../lib/router.jsx';
import { fmtLap } from '../lib/format.js';
import Query from '../components/Query.jsx';
import FeatureLabel from '../components/FeatureLabel.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';

// Everything the signed-in user has added or changed: their notes, the laps they
// added in Steward mode and the real laps they edited.
export default function MyActivity() {
  const me = useDisplayName();
  if (!me.ready) return <div className="page" />;
  return (
    <section className="page container me-page">
      <p className="eyebrow">Your account</p>
      <h1 className="display-xl">My activity</h1>
      {!me.configured && <p className="lede">Sign-in is off on this copy of the app, so notes and steward changes aren't tied to anyone. See the README to turn on Sign in with Google.</p>}
      {me.configured && !me.signedIn && <SignInPrompt>Sign in with Google to see the notes you wrote and the laps you changed.</SignInPrompt>}
      {me.signedIn && <Activity />}
    </section>
  );
}

function Activity() {
  const { data, error } = useApi('/api/me/activity');
  const { driverById, raceByRound } = useSeason();
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return null;
  const raceName = (round) => raceByRound.get(round)?.name || `Round ${round}`;
  const lapRow = (l) => (
    <li key={l._id}>
      <Link to={`/race/${l.round}`}>{raceName(l.round)}</Link>
      <span className="mono">Lap {l.lapNumber} · {l.driver?.code || driverById.get(l.driverId)?.code} · {fmtLap(l.lapTime)}</span>
      {l.deleted ? <span className="lap-tag">hidden</span> : null}
    </li>
  );
  return (
    <>
      <p className="lede">Signed in as {data.user.name}. Only you can edit or delete the notes and laps you added.</p>
      <div className="me-stats">
        <div><strong className="display-md">{data.notes.length}</strong><span>notes</span></div>
        <div><strong className="display-md">{data.added.length}</strong><span>laps added</span></div>
        <div><strong className="display-md">{data.changed.length}</strong><span>real laps changed</span></div>
      </div>

      <h2 className="h-small">Your notes</h2>
      {data.notes.length ? (
        <ul className="me-list">
          {data.notes.map((n) => (
            <li key={n._id}>
              <Link to={`/race/${n.round}#notes`}>{raceName(n.round)}</Link>
              <span>{n.lapNumber ? `Lap ${n.lapNumber}: ` : ''}{n.text}</span>
              <span className="muted small">{n.helpful} helpful{n.editedAt ? ' · edited' : ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No notes yet. Open any race and add one under Fan notes.</p>}

      <h2 className="h-small">Laps you added (Steward mode)</h2>
      {data.added.length ? <ul className="me-list">{data.added.map(lapRow)}</ul> : <p className="muted">None yet.</p>}

      <h2 className="h-small">Real laps you changed</h2>
      {data.changed.length ? <ul className="me-list">{data.changed.map(lapRow)}</ul> : <p className="muted">None yet.</p>}

      <FeatureLabel name="Queries on a nested field: addedBy.userId (who wrote each document)" />
      <Query text={data.query} />
    </>
  );
}
