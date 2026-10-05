import { useApi } from '../lib/useApi.js';
import { useSeason } from '../lib/season.jsx';
import { fmtLap, fmtGap, fmtNum, COMPOUND } from '../lib/format.js';
import DriverName from './DriverName.jsx';
import Query from './Query.jsx';
import FeatureLabel from './FeatureLabel.jsx';

// Each driver's single fastest lap of the race ($sort + $group with $first).
export default function Leaderboard({ round }) {
  const { driverById } = useSeason();
  const { data, error } = useApi(`/api/user/leaderboard?round=${round}`);
  if (error) return <p className="msg msg-err">{error.message}</p>;
  if (!data) return <div className="skeleton" style={{ height: 420 }} />;
  const rows = data.results;
  const leader = rows[0]?.lapTime || 0;
  const maxGap = Math.max(0.001, ...rows.map((r) => r.lapTime - leader));
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th className="num">Pos</th><th>Driver</th><th className="num">Fastest lap</th><th className="num">Lap</th><th>Tyre</th><th className="num">Top speed</th><th className="gap-col">Gap to fastest</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.driverId}>
                <td className="num pos mono">{i + 1}</td>
                <td><DriverName driver={driverById.get(r.driverId)} /></td>
                <td className="num mono strong">{fmtLap(r.lapTime)}</td>
                <td className="num mono">{r.lapNumber}</td>
                <td>{r.compound && <span className="tyre" style={{ '--tyre': COMPOUND[r.compound]?.color }}>{COMPOUND[r.compound]?.label || r.compound}</span>}</td>
                <td className="num mono">{fmtNum(r.topSpeed, 0)}</td>
                <td className="gap-col">
                  <span className="gap-bar"><span style={{ transform: `scaleX(${(r.lapTime - leader) / maxGap})` }} /></span>
                  <span className="mono small">{fmtGap(r.lapTime - leader)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FeatureLabel name="Fastest lap leaderboard" type="user" />
      <Query text={data.query} explain={data.explain} />
    </div>
  );
}
