import { prefersReducedMotion } from './motion.js';

// GSAP and ScrollTrigger are bundled and set on window in lib/gsap.js.
// If they fail to load the site still works, it just doesn't animate.
const HEADINGS = '.display-xl, .display-lg';
const NUMBERS = '.driver-stats dd, .team-stats dd, .hero-stat-value, .kpi';
const PARALLAX = '.portrait-layer img, .stage-photo img';

let ticking = null;

// Drive ScrollTrigger from Lenis so pinned and scrubbed effects stay in sync with smooth scrolling.
export function connectLenis(lenis) {
  const { gsap, ScrollTrigger } = window;
  if (!gsap || !ScrollTrigger || !lenis) return () => {};
  gsap.registerPlugin(ScrollTrigger);
  lenis.on('scroll', ScrollTrigger.update);
  ticking = (t) => lenis.raf(t * 1000);
  gsap.ticker.add(ticking);
  gsap.ticker.lagSmoothing(0);
  return () => { gsap.ticker.remove(ticking); ticking = null; };
}

// Counts a plain number (e.g. "423", "3.61", "26,657") up from zero. Only the text node changes, so React keeps ownership.
function countUp(el, gsap) {
  const node = el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el.firstChild : null;
  const m = node && node.nodeValue.trim().match(/^(\d[\d,]*)(\.\d+)?$/);
  if (!m) return;
  const target = Number((m[1] + (m[2] || '')).replace(/,/g, ''));
  const decimals = m[2] ? m[2].length - 1 : 0;
  const commas = m[1].includes(',');
  const fmt = (v) => {
    const s = v.toFixed(decimals);
    return commas ? Number(s).toLocaleString('en-GB', { minimumFractionDigits: decimals }) : s;
  };
  const final = node.nodeValue;
  const o = { v: 0 };
  gsap.to(o, {
    v: target, duration: 1.1, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 92%', once: true },
    onUpdate: () => { node.nodeValue = fmt(o.v); },
    onComplete: () => { node.nodeValue = final; },
  });
}

export function startScrollMotion(root) {
  const { gsap, ScrollTrigger } = window;
  if (!root || !gsap || !ScrollTrigger || prefersReducedMotion()) return () => {};
  gsap.registerPlugin(ScrollTrigger);

  const seen = new WeakSet();
  const ctx = gsap.context(() => {});
  const scan = () => ctx.add(() => {
    // Big headings rise out of a mask: the eye lands on the title first.
    root.querySelectorAll(HEADINGS).forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      gsap.fromTo(el,
        { yPercent: 40, opacity: 0, clipPath: 'inset(0 0 100% 0)' },
        { yPercent: 0, opacity: 1, clipPath: 'inset(0 0 -20% 0)', duration: 0.9, ease: 'power4.out',
          scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    root.querySelectorAll(NUMBERS).forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      countUp(el, gsap);
    });
    // Photos drift slower than the page, which gives the yellow bands some depth.
    root.querySelectorAll(PARALLAX).forEach((el) => {
      if (seen.has(el)) return; seen.add(el);
      gsap.fromTo(el, { yPercent: -6, scale: 1.12 }, {
        yPercent: 6, scale: 1.12, ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
  });

  scan();
  let queued = 0;
  const mo = new MutationObserver(() => {
    cancelAnimationFrame(queued);
    queued = requestAnimationFrame(() => { scan(); ScrollTrigger.refresh(); });
  });
  mo.observe(root, { childList: true, subtree: true });

  // Nav tucks away while reading down and comes back on the first scroll up.
  const nav = document.querySelector('.nav');
  const navTrigger = nav && ScrollTrigger.create({
    start: 'top -120',
    onUpdate: (self) => nav.classList.toggle('nav-hidden', self.direction === 1),
    onLeaveBack: () => nav.classList.remove('nav-hidden'),
  });

  return () => {
    mo.disconnect(); cancelAnimationFrame(queued);
    navTrigger?.kill(); nav?.classList.remove('nav-hidden');
    ctx.revert();
  };
}
