import { sceneDrawing } from './mascotDrawing';

export interface SocialScene {
  moment: 'seat' | 'gather' | 'pick';
  watch?: boolean;
  seats?: ReadonlyArray<{ ready?: boolean; offline?: boolean }>;
}

/** Furniture is decoration; only the supplied roster changes the gathering seats. */
export function drawSocialMoment(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsed: number,
  { moment, watch = false, seats = [] }: SocialScene
) {
  const { cat, rounded, ellipse, path, line, star } = sceneDrawing(ctx);
  const ink = '#302331';
  const coral = '#EA7058';
  const cream = '#ffdeaa';
  const progress = Math.min(elapsed / 2.4, 1);
  const ease = progress * progress * (3 - 2 * progress);
  ctx.clearRect(0, 0, width, 120);
  ctx.save();
  const scale = Math.min(width / (moment === 'pick' ? 320 : 370), 1);
  ctx.translate(width / 2 - (moment === 'pick' ? 0 : 20), 113);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ellipse(0, -1, 144, 6, '#142335');

  function chair(x: number, ready = false, offline = false, cinema = false) {
    const accent = offline ? '#637082' : ready ? '#9df3bd' : coral;
    rounded(x - 13, -57, 26, 35, cinema ? 9 : 5, '#22374b', '#395167', 2);
    rounded(x - 10, -53, 20, 25, cinema ? 7 : 3, accent);
    line(
      [
        ['moveTo', x - 10, -20],
        ['lineTo', x - 12, 0],
      ],
      '#8291a0',
      3
    );
    line(
      [
        ['moveTo', x + 10, -20],
        ['lineTo', x + 12, 0],
      ],
      '#8291a0',
      3
    );
    rounded(x - 16, -27, 32, 9, 4, '#e99b83', ink, 2);
    if (ready) {
      line(
        [
          ['moveTo', x - 5, -41],
          ['lineTo', x - 1, -37],
          ['lineTo', x + 6, -45],
        ],
        '#234d43',
        2
      );
    }
    if (cinema) {
      rounded(x - 21, -37, 8, 20, 4, '#8b4056', ink, 2);
      rounded(x + 13, -37, 8, 20, 4, '#8b4056', ink, 2);
    }
  }

  if (moment === 'gather') {
    // No vacant target seats: each chair belongs to someone actually in the Session.
    seats.forEach((seat, index) =>
      chair(54 + (index - (seats.length - 1) / 2) * 34, seat.ready, seat.offline)
    );
    cat(-93, -8, 1, 0, false, true, false, elapsed);
    star(-73, -94, 3, cream, 0.7);
  } else if (moment === 'seat') {
    if (watch) {
      rounded(16, -106, 99, 37, 5, '#22374b', '#395167', 2);
      rounded(21, -101, 89, 27, 3, '#9eb5c12b');
      chair(65, false, false, true);
      // Popcorn waits in the cup holder; it never becomes a progress counter.
      path(
        [
          ['moveTo', 83, -56],
          ['lineTo', 104, -56],
          ['lineTo', 101, -35],
          ['lineTo', 87, -35],
          ['closePath'],
        ],
        coral,
        ink,
        2
      );
      for (let i = 0; i < 5; i++) ellipse(85 + i * 4, -58 - (i % 2) * 4, 4, 4, cream, ink, 1);
      line(
        [
          ['moveTo', 93, -52],
          ['lineTo', 94, -39],
        ],
        '#fff0d8',
        3
      );
    } else {
      chair(91 - 9 * ease);
      ellipse(49, -31, 39, 12, '#ffdeaa', ink, 2);
      rounded(45, -28, 8, 27, 2, '#a97a64', ink, 2);
      ellipse(41, -33, 14, 5, '#fff1d9', '#d1a68b', 1);
      rounded(62, -57, 7, 20, 3, '#88b5aa', ink, 1.5);
      line(
        [
          ['moveTo', 65, -57],
          ['lineTo', 63, -69],
        ],
        '#9df3bd',
        2
      );
      ellipse(60, -68, 5, 3, coral);
    }
    cat(-79, -8, 1, 0, false, elapsed < 2.4, false, elapsed);
  } else if (watch) {
    rounded(50, -107, 87, 77, 5, '#22374b', '#8291a0', 2);
    rounded(55, -102, 77, 67, 2, '#ffe7b720');
    if (ease > 0) {
      ctx.save();
      ctx.globalAlpha = ease * 0.45;
      path(
        [['moveTo', 11, -52], ['lineTo', 55, -101], ['lineTo', 55, -35], ['closePath']],
        '#ffdeaa'
      );
      ctx.restore();
      path(
        [['moveTo', 85, -83], ['lineTo', 85, -55], ['lineTo', 108, -69], ['closePath']],
        '#ffdeaa'
      );
    }
    rounded(-17, -65, 32, 27, 5, coral, ink, 2);
    ellipse(-8, -74, 9, 9, '#e99b83', ink, 2);
    ellipse(8, -77, 11, 11, '#e99b83', ink, 2);
    ellipse(-8, -74, 2, 2, ink);
    ellipse(8, -77, 2, 2, ink);
    rounded(11, -58, 8, 13, 2, '#ffdeaa', ink, 2);
    line(
      [
        ['moveTo', -8, -38],
        ['lineTo', -16, -2],
        ['moveTo', 5, -38],
        ['lineTo', 14, -2],
      ],
      '#8291a0',
      3
    );
    cat(-89, -8, 1, 0, false, true, false, Math.min(elapsed, 3));
  } else {
    ellipse(56, -13, 47, 9, '#c28a75', ink, 2);
    rounded(51, -10, 10, 10, 2, '#9c6a5e');
    ellipse(56, -23, 35, 8, '#fff1d9', ink, 2);
    ellipse(56, -26, 24, 6, '#df946e');
    ellipse(52, -28, 13, 5, '#92b585');
    const lidY = -29 - ease * 34;
    path(
      [
        ['moveTo', 20, lidY],
        ['bezierCurveTo', 20, lidY - 41, 92, lidY - 41, 92, lidY],
        ['closePath'],
      ],
      '#aec3cd',
      ink,
      2
    );
    rounded(16, lidY - 3, 80, 5, 2, '#dce2d9', ink, 2);
    ellipse(56, lidY - 33, 5, 3, '#ffdeaa', ink, 2);
    cat(-61, -8, 1, 0, false, true, false, Math.min(elapsed, 3));
  }
  ctx.restore();
}
