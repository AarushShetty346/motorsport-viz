import { Link } from '../lib/router.jsx';

// Team-colour bar + name. Colour carries identity; the text stays in ink colours.
export default function DriverName({ driver, short = false, link = true, sub }) {
  if (!driver) return <span className="muted">Unknown driver</span>;
  const body = (
    <>
      <span className="team-bar" style={{ background: driver.teamColor }} />
      <span className="driver-name-text">
        <span>{short ? <strong>{driver.code}</strong> : <>{driver.firstName} <strong>{driver.lastName}</strong></>}</span>
        {sub !== undefined ? <span className="driver-sub">{sub}</span> : !short && <span className="driver-sub">{driver.team}</span>}
      </span>
    </>
  );
  return link ? <Link className="driver-name" to={`/driver/${driver.key}`}>{body}</Link> : <span className="driver-name">{body}</span>;
}
