// Second colours for each team's car livery (the main colour comes from the data).
const STYLE = {
  mclaren: { accent: '#111114', trim: '#f47600' },
  mercedes: { accent: '#c8ccce', trim: '#00d7b6' },
  'red-bull-racing': { accent: '#e10600', trim: '#ffcc00' },
  ferrari: { accent: '#f4f3ef', trim: '#ffcc00' },
  williams: { accent: '#0a1e3c', trim: '#f4f3ef' },
  'racing-bulls': { accent: '#f4f3ef', trim: '#e10600' },
  'aston-martin': { accent: '#cedc00', trim: '#0b0b0c' },
  'haas-f1-team': { accent: '#e10600', trim: '#f4f3ef' },
  'kick-sauber': { accent: '#0b0b0c', trim: '#52e252' },
  alpine: { accent: '#ff87bc', trim: '#f4f3ef' },
};
export const teamStyle = (key) => STYLE[key] || { accent: '#0b0b0c', trim: '#f4f3ef' };
