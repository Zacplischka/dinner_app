const PARTICIPANT_RING_CLASSES = [
  'border-coral shadow-glow-coral',
  'border-violet shadow-[0_0_18px_rgba(177,70,255,0.3)]',
  'border-cyan shadow-glow-cyan',
  'border-lime shadow-glow-lime',
];

export function participantRingClass(index: number): string {
  return PARTICIPANT_RING_CLASSES[index % PARTICIPANT_RING_CLASSES.length];
}
