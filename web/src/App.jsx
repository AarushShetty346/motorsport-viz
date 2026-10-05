import { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from './lib/router.jsx';
import { SeasonProvider, useSeason } from './lib/season.jsx';
import { EASE_OUT, prefersReducedMotion } from './lib/motion.js';
import Nav from './components/Nav.jsx';
import SearchPalette from './components/SearchPalette.jsx';
import Footer from './components/Footer.jsx';
import LapDrawer from './components/LapDrawer.jsx';
import Home from './pages/Home.jsx';
import Race from './pages/Race.jsx';
import Driver from './pages/Driver.jsx';
import Compare from './pages/Compare.jsx';
import NotFound from './pages/NotFound.jsx';
import Team from './pages/Team.jsx';
import { startReveals } from './lib/reveal.js';

export let lenis = null;

function route(path) {
  let m;
  if (path === '/' || path === '') return { key: 'home', el: <Home /> };
  if ((m = path.match(/^\/race\/(\d+)\/?$/))) return { key: 'race-' + m[1], el: <Race round={Number(m[1])} /> };
  if ((m = path.match(/^\/driver\/([a-z0-9-]+)\/?$/))) return { key: 'driver-' + m[1], el: <Driver driverKey={m[1]} /> };
  if ((m = path.match(/^\/team\/([a-z0-9-]+)\/?$/))) return { key: 'team-' + m[1], el: <Team teamKey={m[1]} /> };
  if (path.startsWith('/compare')) return { key: 'compare', el: <Compare /> };
  return { key: '404', el: <NotFound /> };
}

function Shell() {
  const { path, hash, nav } = useRouter();
  const season = useSeason();
  const [searchOpen, setSearchOpen] = useState(false);
  const current = route(path);
  const first = useRef(true);

  // Smooth scrolling (skipped for people who ask for reduced motion).
  useEffect(() => {
    if (prefersReducedMotion()) return;
    lenis = new Lenis({ autoRaf: true, lerp: 0.075, wheelMultiplier: 0.95 });
    return () => { lenis.destroy(); lenis = null; };
  }, []);

  // New page: jump to the top, or to the #section in the URL.
  useEffect(() => {
    const go = () => {
      const target = hash ? document.querySelector(hash) : null;
      if (target) lenis ? lenis.scrollTo(target, { offset: -72, immediate: first.current }) : target.scrollIntoView();
      else lenis ? lenis.scrollTo(0, { immediate: true }) : scrollTo(0, 0);
      first.current = false;
    };
    const t = setTimeout(go, hash ? 350 : 0);
    return () => clearTimeout(t);
  }, [path, hash, nav, season.ready]);

  // Scroll-in reveals for whatever the current page renders.
  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => {
      const mains = document.querySelectorAll('main');
      stop = startReveals(mains[mains.length - 1]);
    }, 220);
    return () => { clearTimeout(t); stop(); };
  }, [current.key]);

  // ⌘K / Ctrl+K or "/" opens search.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    lenis?.[searchOpen ? 'stop' : 'start']();
  }, [searchOpen]);

  return (
    <>
      <Nav onSearch={() => setSearchOpen(true)} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={current.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.28, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.14 } }}
        >
          {season.error ? <DbDown error={season.error} /> : current.el}
        </motion.main>
      </AnimatePresence>
      <Footer />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <LapDrawer />
    </>
  );
}

function DbDown({ error }) {
  return (
    <section className="page narrow center-block">
      <p className="eyebrow">Can't reach the data</p>
      <h1 className="display-md">MongoDB isn't answering</h1>
      <p className="lede">{error.message}. Make sure the server and MongoDB are running (see the README), then reload.</p>
    </section>
  );
}

export default function App() {
  return (
    <SeasonProvider>
      <Shell />
    </SeasonProvider>
  );
}
