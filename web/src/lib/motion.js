// Shared motion tokens: one ease family, durations sized to the element.
export const EASE_OUT = [0.22, 1, 0.36, 1];
export const EASE_IN_OUT = [0.65, 0, 0.35, 1];

// Animations always play, whatever the OS motion setting says, so the demo looks the same on every laptop.
export const prefersReducedMotion = () => false;
