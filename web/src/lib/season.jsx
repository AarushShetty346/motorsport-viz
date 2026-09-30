import { createContext, useContext, useMemo } from 'react';
import { useApi } from './useApi.js';

// Drivers, races and standings are used on every page, so they load once here.
const SeasonContext = createContext(null);

export function SeasonProvider({ children }) {
  const drivers = useApi('/api/drivers');
  const races = useApi('/api/races');
  const standings = useApi('/api/nosql/aggregation');
  const health = useApi('/api/health');

  const value = useMemo(() => {
    const list = drivers.data || [];
    const byId = new Map(list.map((d) => [d._id, d]));
    const byKey = new Map(list.map((d) => [d.key, d]));
    const raceList = races.data || [];
    const standingsRows = standings.data?.results || [];
    // Teammates share a colour; the lower-placed one gets a dashed line in charts.
    const seenTeams = new Set();
    const dashed = new Set();
    for (const row of standingsRows) {
      if (seenTeams.has(row.team)) dashed.add(row.driverId);
      seenTeams.add(row.team);
    }
    return {
      ready: !!(drivers.data && races.data && standings.data),
      error: drivers.error || races.error || standings.error,
      drivers: list,
      driverById: byId,
      driverByKey: byKey,
      races: raceList,
      raceByRound: new Map(raceList.map((r) => [r.round, r])),
      standings: standingsRows,
      standingsQuery: standings.data?.query,
      position: new Map(standingsRows.map((r, i) => [r.driverId, i + 1])),
      dashed,
      health: health.data,
      healthError: health.error,
    };
  }, [drivers.data, races.data, standings.data, health.data, drivers.error, races.error, standings.error, health.error]);

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

export const useSeason = () => useContext(SeasonContext);
