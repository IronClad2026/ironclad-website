export const fadeUp = {
  hidden: { opacity: 0, y: 35 },
  visible: { opacity: 1, y: 0 },
};

export const sectionReveal = {
  hidden: { opacity: 0, y: 48 },
  visible: { opacity: 1, y: 0 },
};

export const sectionRevealViewport = {
  once: true,
  margin: "-80px",
} as const;

export const sectionRevealTransition = {
  duration: 0.6,
} as const;
