import { useCallback } from 'react';
import AnimatedScene from './AnimatedScene';
import { drawSocialMoment, type SocialScene } from './socialMomentScene';

export default function SocialMoment(props: SocialScene) {
  const { moment, watch, seats } = props;
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, elapsed: number) =>
      drawSocialMoment(ctx, width, elapsed, { moment, watch, seats }),
    [moment, watch, seats]
  );
  return (
    <AnimatedScene
      draw={draw}
      height={120}
      label={
        moment === 'seat'
          ? 'Saved you a seat'
          : moment === 'gather'
            ? 'Getting together'
            : 'Tonight’s pick'
      }
      duration={moment === 'pick' ? 3 : undefined}
    />
  );
}
