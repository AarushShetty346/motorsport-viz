import Hero from '../components/Hero.jsx';
import SeasonPicker from '../components/SeasonPicker.jsx';

// The front door: the hero, then scroll into the season picker.
export default function Landing() {
  return (
    <>
      <Hero landing />
      <SeasonPicker />
    </>
  );
}
