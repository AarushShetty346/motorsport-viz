import { lazy, Suspense } from 'react';
import '../carShowcase.css';
import { posterFor } from '../lib/teams.js';

// three.js only downloads when someone opens a team page.
const CarModel = lazy(() => import('./CarModel.jsx'));

// The team's real car in 3D. Drag to turn it.
export default function CarShowcase({ name, info }) {
  if (!info.model) return null;
  return (
    <div className="car-showcase">
      <Suspense fallback={<div className="car-model"><img className="car-model-poster" src={posterFor(info.model, 'side')} alt="" /></div>}>
        <CarModel model={info.model} poster={posterFor(info.model, 'side')} interactive label={`${name} ${info.car || 'car'}, 3D model`} />
      </Suspense>
      <p className="car-showcase-hint mono">{info.car}{info.model.shown ? ` · model shows the ${info.model.shown}` : ''} · drag to turn</p>
    </div>
  );
}
