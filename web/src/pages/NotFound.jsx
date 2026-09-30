import { Link } from '../lib/router.jsx';

export default function NotFound() {
  return (
    <section className="page narrow center-block">
      <p className="eyebrow">Off track</p>
      <h1 className="display-md">This page ran wide</h1>
      <p className="lede"><Link to="/" className="text-link">Back to the season</Link></p>
    </section>
  );
}
