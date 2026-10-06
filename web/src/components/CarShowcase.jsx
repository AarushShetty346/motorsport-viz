import { lazy, Suspense, useState } from 'react';
import { useCarMedia } from '../lib/carMedia.js';
import '../carShowcase.css';

// three.js only downloads when someone opens a team page.
const Car3D = lazy(() => import('./Car3D.jsx'));

// The team's car two ways: the animated one drawn in code, and the real one (a 3D
// model or a photo from web/public/img/cars/). The choice sticks while you browse teams.
let lastView = 'drawn';

export default function CarShowcase({ teamKey, name, info }) {
  const media = useCarMedia(teamKey);
  const [view, setView] = useState(lastView);
  const pick = (v) => { lastView = v; setView(v); };
  const carName = info.car || 'car';

  return (
    <div className="car-showcase">
      <div className="car-toggle" role="group" aria-label="Which car to show">
        <button type="button" aria-pressed={view === 'drawn'} onClick={() => pick('drawn')}>Animated</button>
        <button type="button" aria-pressed={view === 'real'} onClick={() => pick('real')}>Real car</button>
      </div>

      {view === 'drawn' && (
        <Suspense fallback={<div className="car3d" />}>
          <Car3D livery={info.livery} car={info.car} label={`${name} ${carName}, drawn in 3D`} />
        </Suspense>
      )}

      {view === 'real' && media?.model && (
        <>
          <Suspense fallback={<div className="car3d" />}>
            <Car3D livery={info.livery} car={info.car} model={{ url: `/img/cars/${media.model}`, rotate: media.modelRotate || 0 }} label={`${name} ${carName}, 3D model`} />
          </Suspense>
          <Credit by={media.modelAuthor} license={media.modelLicense} url={media.modelSourceUrl} what="Model" />
        </>
      )}

      {view === 'real' && media && !media.model && media.photo && (
        <figure className="car-photo">
          <img src={`/img/cars/${media.photo}`} alt={`The ${name} ${carName}`} />
          <Credit by={media.author} license={media.license} url={media.sourceUrl} what="Photo" />
        </figure>
      )}

      {view === 'real' && media && !media.model && !media.photo && (
        <figure className="car-photo car-photo-empty">
          <svg viewBox="0 0 560 140" aria-hidden="true">
            <path d="M18 104 L44 92 L170 86 L236 66 L262 50 L290 50 L300 64 L392 66 L438 40 L470 40 L476 72 L520 78 L540 104 Z" />
            <circle cx="132" cy="104" r="26" /><circle cx="440" cy="104" r="28" />
          </svg>
          <figcaption>
            <strong>No photo of the real {carName} yet.</strong>
            <span>Add one, or a 3D model, to web/public/img/cars/ (the README explains how).</span>
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function Credit({ by, license, url, what }) {
  if (!by && !license) return null;
  const text = `${what}: ${by || 'unknown author'}${license ? `, ${license}` : ''}`;
  return <p className="car-credit">{url ? <a href={url} target="_blank" rel="noreferrer">{text}</a> : text}</p>;
}
