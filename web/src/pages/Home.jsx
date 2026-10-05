import { useSeason } from '../lib/season.jsx';
import Hero from '../components/Hero.jsx';
import TitleFight from '../components/TitleFight.jsx';
import Calendar from '../components/Calendar.jsx';
import Standings from '../components/Standings.jsx';
import SpeedTrap from '../components/SpeedTrap.jsx';
import { Link } from '../lib/router.jsx';
import ScrollWords from '../components/ScrollWords.jsx';
import Marquee from '../components/Marquee.jsx';
import { fmtNum } from '../lib/format.js';
import { CircuitMap } from '../components/CircuitMap.jsx';
import { Movers } from '../components/RaceAnalytics.jsx';

export default function Home() {
  const { ready, standings, health } = useSeason();
  const [p1, p2, p3] = standings;
  const last = (s) => s?.name.split(' ').slice(-1)[0];
  return (
    <>
      <Hero />
      {ready && (
        <div className="after-stage">
          {p1 && p2 && p3 && (
            <section className="container statement">
              <ScrollWords text={`${p1.name} won the 2025 title by ${p1.points - p2.points} points. ${last(p2)} was second and ${last(p3)} third, ${p2.points - p3.points} points further back. Twenty-four Grands Prix and ${health ? fmtNum(health.counts.laps) : 'thousands of'} laps decided it, and every one of those laps is in here.`} />
            </section>
          )}
          <TitleFight />
          <Calendar />
          <CircuitMap />
          {p1 && <Marquee items={['2025 World Champion', p1.name, `${p1.points} points`, `${p1.wins} wins`, 'Lap by Lap']} />}
          <Standings />
          <section className="section container">
            <div className="section-head">
              <p className="eyebrow">Season movers</p>
              <h2 className="display-lg">Who gained the most places</h2>
            </div>
            <Movers />
          </section>
          <section className="section container split">
            <SpeedTrap num="04" />
            <div className="cta-card tone-light">
              <p className="eyebrow"><span className="num">05</span>Head to head</p>
              <h2 className="display-md">Who was really quicker?</h2>
              <p className="lede">Pick any two drivers. MongoDB averages their racing laps race by race, so the comparison is always like for like.</p>
              <Link to="/compare" className="btn btn-primary">Compare drivers</Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
