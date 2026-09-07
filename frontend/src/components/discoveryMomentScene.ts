import { sceneDrawing } from './mascotDrawing';

const ink = '#302a39';
const paper = '#fff1d9';

/** A folded sketch, deliberately without places, route data or a location marker. */
function foldedMap(ctx: CanvasRenderingContext2D, x: number, y: number, open: number) {
  const { path, line } = sceneDrawing(ctx);
  const fold = 12 + open * 17;
  for (let panel = 0; panel < 3; panel++) {
    const left = x + (panel - 1.5) * fold;
    const rise = panel % 2 === 0 ? 5 : -5;
    path(
      [
        ['moveTo', left, y + rise],
        ['lineTo', left + fold, y - rise],
        ['lineTo', left + fold, y + 52 - rise],
        ['lineTo', left, y + 52 + rise],
        ['closePath'],
      ],
      panel === 1 ? '#e4dbbe' : paper,
      ink,
      2
    );
    // A few decorative blocks make the paper read as a map; they never stand
    // for actual venues or depict how much of the search has completed.
    line(
      [
        ['moveTo', left + fold * 0.25, y + 14],
        ['lineTo', left + fold * 0.7, y + 14],
        ['lineTo', left + fold * 0.7, y + 34],
      ],
      '#94b2a0',
      3
    );
  }
}

/** Scout keeps moving only while ComparePage owns an actual pending search. */
export function drawNeighbourhoodScout(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsed: number
) {
  const { rounded, ellipse, path, line, cat } = sceneDrawing(ctx);
  ctx.clearRect(0, 0, width, 180);
  ctx.save();
  ctx.translate(width / 2, 0);
  const scale = Math.min((width - 12) / 300, 1);
  ctx.scale(scale, scale);
  // Reserve the runtime's bottom-right Pause control without distorting the cat.
  ctx.translate(-150, -28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ellipse(153, 153, 137, 11, '#121b24');
  // One illustrative awning, with no retailer identity or available-venue claim.
  rounded(203, 54, 61, 94, 6, '#314153', ink, 2);
  rounded(218, 96, 23, 52, 3, '#182733', '#87b8b1', 2);
  ellipse(236, 122, 2, 2, paper);
  path(
    [
      ['moveTo', 198, 54],
      ['lineTo', 269, 54],
      ['lineTo', 277, 77],
      ['lineTo', 190, 77],
      ['closePath'],
    ],
    '#cf8190',
    ink,
    2
  );
  for (let stripe = 0; stripe < 4; stripe++) {
    line(
      [
        ['moveTo', 205 + stripe * 18, 58],
        ['lineTo', 200 + stripe * 20, 73],
      ],
      '#ffe0b8',
      7
    );
  }
  const phase = elapsed * 0.85;
  const moving = Math.abs(Math.cos(phase)) > 0.38;
  cat(
    106 + Math.sin(phase) * 37,
    149,
    Math.cos(phase) >= 0 ? 1 : -1,
    elapsed * 9,
    moving,
    !moving,
    false,
    elapsed
  );
  ctx.save();
  ctx.translate(252, 135);
  ctx.rotate(-0.13);
  ctx.scale(0.46, 0.46);
  foldedMap(ctx, 0, -45, 0.8);
  ctx.restore();
  ctx.restore();
}

/** A brief unfold, then the runtime holds the final pose until Change area. */
export function drawALittleFurther(ctx: CanvasRenderingContext2D, width: number, elapsed: number) {
  const { ellipse, cat } = sceneDrawing(ctx);
  ctx.clearRect(0, 0, width, 180);
  ctx.save();
  ctx.translate(width / 2, 0);
  const scale = Math.min((width - 12) / 300, 1);
  ctx.translate(0, (180 - 180 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.translate(-150, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ellipse(151, 157, 116, 10, '#121b24');
  const time = Math.min(3, elapsed);
  cat(91, 151, 1, 0, false, true, false, time);
  const opening = Math.min(1, time / 2.2);
  foldedMap(ctx, 205, 93, opening * opening * (3 - 2 * opening));
  ctx.restore();
}
