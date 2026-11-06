import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { useDisplayName } from '../lib/displayName.js';
import { Link } from '../lib/router.jsx';
import Query from '../components/Query.jsx';
import FeatureLabel from '../components/FeatureLabel.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';

// The signed-in user's notes and whether each one is public yet.
export default function MyActivity() {
  const me = useDisplayName();
  if (!me.ready) return <div className="page" />;
  return (
    <section className="page container me-page">
      <p className="eyebrow">Your account</p>
      <h1 className="display-xl">My activity</h1>
      {!me.configured && <p className="lede">Sign-in is off on this copy of the app, so there are no personal notes. See the README to turn on Sign in with Google.</p>}
      {me.configured && !me.signedIn && <SignInPrompt>Sign in with Google to see the notes you wrote.</SignInPrompt>}
      {me.signedIn && <Activity />}
    </section>
  );
}

function Activity() {
  const { data, error } = useApi('/api/me/activity');
  const { raceByRound } = useSeason();
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return null;
  const raceName = (round) => raceByRound.get(round)?.name || `Round ${round}`;
  return (
    <>
      <p className="lede">Signed in as {data.user.name}. Your notes stay private to you until they are approved, then everyone can read them.</p>
      <div className="me-stats">
        <div><strong className="display-md">{data.notes.length}</strong><span>notes</span></div>
        <div><strong className="display-md">{data.notes.filter((n) => n.approved).length}</strong><span>public</span></div>
      </div>

      <h2 className="h-small">Your notes</h2>
      {data.notes.length ? (
        <ul className="me-list">
          {data.notes.map((n) => (
            <li key={n._id}>
              <Link to={`/race/${n.round}#notes`}>{raceName(n.round)}</Link>
              <span>{n.lapNumber ? `Lap ${n.lapNumber}: ` : ''}{n.text}</span>
              <span className="muted small">{n.approved ? 'public' : 'waiting for review'} · {n.helpful} helpful{n.editedAt ? ' · edited' : ''}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No notes yet. Open any race and add one under Fan notes.</p>}

      <FeatureLabel name="Queries on a nested field: addedBy.userId (who wrote each document)" />
      <Query text={data.query} />
    </>
  );
}
