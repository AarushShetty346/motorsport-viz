// Team pages live at /team/<slug>, e.g. "Red Bull Racing" -> /team/red-bull-racing.
export const teamKey = (name = '') => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const teamPath = (name) => `/team/${teamKey(name)}`;

// Facts the season data doesn't carry (car name, base, engine) and each team's
// livery for the 3D car: main body colour, second colour, and a trim colour.
export const TEAMS = {
  mclaren: { car: 'MCL39', base: 'Woking, United Kingdom', engine: 'Mercedes', livery: { body: '#f47600', accent: '#141416', stripe: '#f47600' } },
  ferrari: { car: 'SF-25', base: 'Maranello, Italy', engine: 'Ferrari', livery: { body: '#d8051b', accent: '#141416', stripe: '#f4f3ef' } },
  'red-bull-racing': { car: 'RB21', base: 'Milton Keynes, United Kingdom', engine: 'Honda RBPT', livery: { body: '#1b2440', accent: '#e2163b', stripe: '#f6c700' } },
  mercedes: { car: 'W16', base: 'Brackley, United Kingdom', engine: 'Mercedes', livery: { body: '#18181b', accent: '#00d7b6', stripe: '#c4c8cc' } },
  'aston-martin': { car: 'AMR25', base: 'Silverstone, United Kingdom', engine: 'Mercedes', livery: { body: '#00584a', accent: '#cedc00', stripe: '#cedc00' } },
  alpine: { car: 'A525', base: 'Enstone, United Kingdom', engine: 'Renault', livery: { body: '#0b6fb8', accent: '#ff7eb6', stripe: '#141416' } },
  williams: { car: 'FW47', base: 'Grove, United Kingdom', engine: 'Mercedes', livery: { body: '#0a2a6b', accent: '#2ea8ff', stripe: '#f4f3ef' } },
  'racing-bulls': { car: 'VCARB 02', base: 'Faenza, Italy', engine: 'Honda RBPT', livery: { body: '#eef0f3', accent: '#1d3fd1', stripe: '#e2163b' } },
  'kick-sauber': { car: 'C45', base: 'Hinwil, Switzerland', engine: 'Ferrari', livery: { body: '#151517', accent: '#01d814', stripe: '#01d814' } },
  'haas-f1-team': { car: 'VF-25', base: 'Kannapolis, United States', engine: 'Ferrari', livery: { body: '#eef0f3', accent: '#141416', stripe: '#e10600' } },
};

export const teamInfo = (name, color = '#888888') =>
  TEAMS[teamKey(name)] || { car: '', base: '', engine: '', livery: { body: color, accent: '#141416', stripe: color } };
