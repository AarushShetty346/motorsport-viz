// Team pages live at /team/<slug>, e.g. "Red Bull Racing" -> /team/red-bull-racing.
export const teamKey = (name = '') => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const teamPath = (name) => `/team/${teamKey(name)}`;
