import { Link } from '../lib/router.jsx';
import Band from '../components/Band.jsx';

export default function NotFound() {
  return (
    <article className="page band-page">
      <Band className="notfound-band">
        <p className="band-meta">404 · Off track</p>
        <h1 className="display-xl">This page<br />ran wide.</h1>
        <p className="lede"><Link to="/" className="btn btn-primary">Back to the season</Link></p>
      </Band>
    </article>
  );
}
