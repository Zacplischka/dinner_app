const PARTICIPANT_RING_CLASSES = [
  'border-coral shadow-glow-coral',
  'border-violet shadow-card',
  'border-cyan shadow-glow-cyan',
  'border-lime shadow-glow-lime',
];

export function participantRingClass(index: number): string {
  return PARTICIPANT_RING_CLASSES[index % PARTICIPANT_RING_CLASSES.length];
}
