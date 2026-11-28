import { createRoot } from 'react-dom/client';
import CarModel from './components/CarModel.jsx';

// Dev only: /poster.html?file=/models/x.glb&view=side|tq&w=..&h=..&paint={...}
window.__carPoster = true;
const q = new URLSearchParams(location.search);
const el = document.getElementById('car');
el.style.setProperty('--w', `${q.get('w')}px`);
el.style.setProperty('--h', `${q.get('h')}px`);
const model = { file: q.get('file'), paint: q.get('paint') ? JSON.parse(q.get('paint')) : null };
const tq = q.get('view') === 'tq';
createRoot(el).render(<CarModel model={model} spin={0} view={tq ? 'three-quarter' : 'side'} distance={tq ? 1.25 : 1} label="" />);
