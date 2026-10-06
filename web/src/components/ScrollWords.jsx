import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { prefersReducedMotion } from '../lib/motion.js';

// A big statement whose words light up one by one as it scrolls through the screen.
export default function ScrollWords({ text, className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.4'] });
  const words = text.split(' ');
  const reduced = prefersReducedMotion();
  return (
    <p ref={ref} className={`scroll-words ${className}`}>
      {words.map((w, i) => (
        <Word key={i} progress={scrollYProgress} from={i / words.length} to={(i + 1) / words.length} reduced={reduced}>{w}</Word>
      ))}
    </p>
  );
}

function Word({ progress, from, to, reduced, children }) {
  // Function form keeps this on the JS path (see Hero.jsx).
  const opacity = useTransform(progress, (v) => (reduced ? 1 : 0.14 + 0.86 * Math.min(1, Math.max(0, (v - from) / (to - from)))));
  return <motion.span style={{ opacity }}>{children} </motion.span>;
}
