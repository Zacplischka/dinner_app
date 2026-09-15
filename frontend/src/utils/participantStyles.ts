const PARTICIPANT_RING_CLASSES = [
  'border-coral shadow-glow',
  'border-violet shadow-card',
  'border-text shadow-glow',
  'border-lime shadow-glow',
];

export function participantRingClass(index: number): string {
  return PARTICIPANT_RING_CLASSES[index % PARTICIPANT_RING_CLASSES.length];
}
