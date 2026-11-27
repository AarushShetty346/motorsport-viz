import { apiSeason } from './api.js';

// Team pages live at /team/<slug>, e.g. "Red Bull Racing" -> /team/red-bull-racing.
export const teamKey = (name = '') => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const teamPath = (name) => `/team/${teamKey(name)}`;

// Facts the season data doesn't carry (car name, base, engine), each team's livery
// colours (body, second colour, trim), and which 3D model in web/public/models shows the car.
// Model credits are in web/public/models/CREDITS.md.
const BASES = {
  mclaren: { base: 'Woking, United Kingdom', engine: 'Mercedes' },
  ferrari: { base: 'Maranello, Italy', engine: 'Ferrari' },
  'red-bull-racing': { base: 'Milton Keynes, United Kingdom', engine: 'Honda RBPT' },
  mercedes: { base: 'Brackley, United Kingdom', engine: 'Mercedes' },
  'aston-martin': { base: 'Silverstone, United Kingdom', engine: 'Mercedes' },
  alpine: { base: 'Enstone, United Kingdom', engine: 'Renault' },
  williams: { base: 'Grove, United Kingdom', engine: 'Mercedes' },
  'racing-bulls': { base: 'Faenza, Italy', engine: 'Honda RBPT' },
  rb: { base: 'Faenza, Italy', engine: 'Honda RBPT' },
  'kick-sauber': { base: 'Hinwil, Switzerland', engine: 'Ferrari' },
  'haas-f1-team': { base: 'Kannapolis, United States', engine: 'Ferrari' },
};

const LIVERY = {
  mclaren: { body: '#f47600', accent: '#141416', stripe: '#f47600' },
  ferrari: { body: '#d8051b', accent: '#141416', stripe: '#f4f3ef' },
  'red-bull-racing': { body: '#1b2440', accent: '#e2163b', stripe: '#f6c700' },
  mercedes: { body: '#18181b', accent: '#00d7b6', stripe: '#c4c8cc' },
  'aston-martin': { body: '#00584a', accent: '#cedc00', stripe: '#cedc00' },
  alpine: { body: '#0b6fb8', accent: '#ff7eb6', stripe: '#141416' },
  williams: { body: '#0a2a6b', accent: '#2ea8ff', stripe: '#f4f3ef' },
  'racing-bulls': { body: '#eef0f3', accent: '#1d3fd1', stripe: '#e2163b' },
  rb: { body: '#1d3fd1', accent: '#eef0f3', stripe: '#e2163b' },
  'kick-sauber': { body: '#151517', accent: '#01d814', stripe: '#01d814' },
  'haas-f1-team': { body: '#eef0f3', accent: '#141416', stripe: '#e10600' },
};

// model: a file in web/public/models (without .glb). paint: the team's colour is
// applied to the model's body, for teams shown on the shared base car.
// shown: the model is another year's car from the same team (no free model of this one exists).
const CARS = {
  2025: {
    mclaren: { car: 'MCL39', model: '2025-mclaren' },
    ferrari: { car: 'SF-25', model: '2025-ferrari' },
    'red-bull-racing': { car: 'RB21', model: '2025-red-bull' },
    mercedes: { car: 'W16', model: '2024-mercedes', shown: 'W15' },
    'aston-martin': { car: 'AMR25', model: '2025-aston-martin' },
    alpine: { car: 'A525', model: '2025-alpine' },
    williams: { car: 'FW47', model: '2025-williams' },
    'racing-bulls': { car: 'VCARB 02', model: '2025-racing-bulls' },
    'kick-sauber': { car: 'C45', model: '2025-sauber' },
    'haas-f1-team': { car: 'VF-25', model: 'base', shown: 'a generic 2025 car' },
  },
  2024: {
    mclaren: { car: 'MCL38', model: '2025-mclaren', shown: 'MCL39' },
    ferrari: { car: 'SF-24', model: '2025-ferrari', shown: 'SF-25' },
    'red-bull-racing': { car: 'RB20', model: '2024-red-bull' },
    mercedes: { car: 'W15', model: '2024-mercedes' },
    'aston-martin': { car: 'AMR24', model: '2024-aston-martin' },
    alpine: { car: 'A524', model: '2024-alpine' },
    williams: { car: 'FW46', model: '2024-williams' },
    rb: { car: 'VCARB 01', model: '2024-rb' },
    'kick-sauber': { car: 'C44', model: '2025-sauber', shown: 'C45' },
    'haas-f1-team': { car: 'VF-24', model: 'base', shown: 'a generic 2025 car' },
  },
};

export const carFor = (name, season = apiSeason()) => {
  const car = CARS[season]?.[teamKey(name)];
  if (!car) return null;
  return { ...car, model: { file: `/models/${car.model}.glb`, shown: car.shown || null } };
};

export const teamInfo = (name, color = '#888888', season = apiSeason()) => {
  const key = teamKey(name);
  const car = carFor(name, season);
  return {
    car: car?.car || '',
    model: car?.model || null,
    base: BASES[key]?.base || '',
    engine: BASES[key]?.engine || '',
    livery: LIVERY[key] || { body: color, accent: '#141416', stripe: color },
  };
};
