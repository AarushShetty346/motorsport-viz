import { lazy, Suspense } from 'react';
import '../carShowcase.css';

// three.js only downloads when someone opens a team page.
const Car3D = lazy(() => import('./Car3D.jsx'));

// The team's car, drawn in 3D in its own livery.
export default function CarShowcase({ name, info }) {
  return (
    <div className="car-showcase">
      <Suspense fallback={<div className="car3d" />}>
        <Car3D livery={info.livery} car={info.car} label={`${name} ${info.car || 'car'}, drawn in 3D`} />
      </Suspense>
    </div>
  );
}
