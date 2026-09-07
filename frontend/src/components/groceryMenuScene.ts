import { sceneDrawing } from './mascotDrawing';

/** A decorative grocery run: the API exposes no per-ingredient progress. */
export function drawGroceryRun(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsed: number,
  height = 120
) {
  const { cat, rounded, ellipse, line } = sceneDrawing(ctx);
  const scale = Math.min(width / 320, height / 120);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate((width - 320 * scale) / 2, (height - 120 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Two shelves, recognisable produce, and a clear foreground for the trolley.
  rounded(232, 1, 74, 56, 6, '#142335', '#314453', 1.5);
  for (const y of [25, 51]) {
    rounded(233, y, 72, 5, 2, '#73877e');
    for (const x of [247, 269, 291]) {
      ellipse(x, y - 8, 7, 8, y === 25 ? '#b5d895' : '#ef977b', '#302a39', 1.5);
      line(
        [
          ['moveTo', x, y - 15],
          ['lineTo', x + 3, y - 20],
        ],
        '#8ab57e',
        2
      );
    }
  }
  line(
    [
      ['moveTo', 12, 111],
      ['lineTo', 308, 111],
    ],
    '#334452',
    1.5
  );

  const walking = elapsed % 7 < 4.5;
  const x = 88 + Math.sin(elapsed * 0.9) * 10;
  cat(x, 103, 1, elapsed * 6, walking, true, false, elapsed);
  // The lifted paw rests on the handle, with a coral wire basket ahead.
  const cart = x + 70;
  line(
    [
      ['moveTo', x + 35, 65],
      ['lineTo', cart - 15, 65],
      ['lineTo', cart - 7, 97],
      ['lineTo', cart + 50, 97],
    ],
    '#ff8f9e',
    3
  );
  ellipse(cart + 10, 65, 9, 9, '#b5d895', '#302a39', 1.5);
  rounded(cart + 23, 51, 12, 26, 5, '#e5ba87', '#302a39', 1.5);
  rounded(cart - 10, 66, 63, 23, 4, '#ff75891c', '#ff8f9e', 2.5);
  for (const bar of [5, 20, 35]) {
    line(
      [
        ['moveTo', cart + bar, 68],
        ['lineTo', cart + bar, 87],
      ],
      '#ff8f9e',
      1
    );
  }
  for (const wheel of [0, 43]) {
    ellipse(cart + wheel, 104, 5, 5, '#182635', '#ffbcc2', 2);
    const turn = walking ? elapsed * 6 : 0;
    line(
      [
        ['moveTo', cart + wheel, 104],
        ['lineTo', cart + wheel + Math.cos(turn) * 3, 104 + Math.sin(turn) * 3],
      ],
      '#ffbcc2',
      1.5
    );
  }
  ctx.restore();
}

/** The closed menu stays with the courier until the real Pinned Menu arrives. */
export function drawMenuDelivery(ctx: CanvasRenderingContext2D, width: number, elapsed: number) {
  const { cat, rounded, ellipse, line, star } = sceneDrawing(ctx);
  const scale = Math.min(width / 320, 1);
  ctx.clearRect(0, 0, width, 180);
  ctx.save();
  ctx.translate((width - 320 * scale) / 2, (136 - 160 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ellipse(151, 144, 142, 6, '#101e2c');
  star(86, 21, 3, '#ffe3b7', 0.6);
  star(186, 34, 2, '#839cb0', 0.6);

  // A table set for the group; no illustrated menu has been delivered yet.
  for (const x of [232, 294]) {
    rounded(x - 10, 91, 20, 33, 5, '#203746', '#476071', 1.5);
    line(
      [
        ['moveTo', x - 7, 124],
        ['lineTo', x - 7, 145],
      ],
      '#476071',
      3
    );
  }
  ellipse(264, 116, 42, 10, '#deaa83', '#302a39', 2);
  line(
    [
      ['moveTo', 264, 122],
      ['lineTo', 264, 146],
    ],
    '#9d7c6e',
    5
  );
  line(
    [
      ['moveTo', 251, 147],
      ['lineTo', 277, 147],
    ],
    '#9d7c6e',
    4
  );
  for (const x of [244, 283]) {
    ellipse(x, 113, 10, 4, '#fff1d9', '#b9afa3', 1);
    ellipse(x, 113, 6, 2, undefined, '#c5b9a4', 1);
  }
  rounded(260, 99, 7, 14, 3, '#ff9bab');
  ellipse(264, 97, 2, 5, '#ffe6b3');

  const x = 102 + Math.sin(elapsed * 0.7) * 21;
  cat(x, 142, 1, elapsed * 5, true, true, false, elapsed);
  // A folded cream menu in the raised paw, with a coral spine and plate motif.
  ctx.save();
  ctx.translate(x + 42, 104 + Math.sin(elapsed * 2) * 1.2);
  ctx.rotate(-0.1);
  rounded(-10, -27, 29, 40, 3, '#fff1d9', '#302a39', 2);
  rounded(-10, -27, 5, 40, 2, '#ff8f9e');
  ellipse(6, -10, 7, 7, undefined, '#b47764', 1.5);
  line(
    [
      ['moveTo', -1, 3],
      ['lineTo', 12, 3],
    ],
    '#b47764',
    1.5
  );
  ctx.restore();
  ctx.restore();
}
