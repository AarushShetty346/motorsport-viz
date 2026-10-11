// GSAP and ScrollTrigger are bundled (no CDN) so the scroll motion also works offline.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

window.gsap = gsap;
window.ScrollTrigger = ScrollTrigger;
