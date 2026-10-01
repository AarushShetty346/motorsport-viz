import { prefersReducedMotion } from './motion.js';

// Section heads, cards and panels slide up into place the first time they scroll into view.
const SELECTOR = '.section-head, .reveal, .lab-card, .h2h-card, .podium-step, .kpis > div, .cta-card, .speed-trap, .delta-chart, .team-driver, .helmet-card';

export function startReveals(root) {
  if (!root || prefersReducedMotion() || typeof IntersectionObserver !== 'function') return () => {};
  document.documentElement.classList.add('js-reveal');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in-view');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px' });
  const scan = () => root.querySelectorAll(SELECTOR).forEach((el) => {
    if (el.dataset.reveal) return;
    el.dataset.reveal = '1';
    // Anything already on screen shows at once instead of animating.
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.88 && r.bottom > 0) el.classList.add('in-view');
    else io.observe(el);
  });
  scan();
  const mo = new MutationObserver(scan);
  mo.observe(root, { childList: true, subtree: true });
  return () => { io.disconnect(); mo.disconnect(); };
}
