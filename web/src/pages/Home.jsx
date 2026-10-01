import { useSeason } from '../lib/season.jsx';
import Hero from '../components/Hero.jsx';
import TitleFight from '../components/TitleFight.jsx';
import Calendar from '../components/Calendar.jsx';
import Standings from '../components/Standings.jsx';
import SpeedTrap from '../components/SpeedTrap.jsx';
import { Link } from '../lib/router.jsx';

export default function Home() {
  const { ready } = useSeason();
  return (
    <>
      <Hero />
      {ready && (
        <div className="after-stage">
          <TitleFight />
          <Calendar />
          <Standings />
          <section className="section container split">
            <SpeedTrap />
            <div className="cta-card">
              <p className="eyebrow">Head to head</p>
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
