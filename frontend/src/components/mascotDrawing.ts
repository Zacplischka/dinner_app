import type { StorefrontStatus } from '@dinder/shared/types';

type PathCommand =
  | ['moveTo' | 'lineTo', number, number]
  | ['quadraticCurveTo', number, number, number, number]
  | ['bezierCurveTo', number, number, number, number, number, number]
  | ['closePath'];

/** Shared artwork from the original Price Patrol. Coordinates are CSS pixels. */
export function sceneDrawing(ctx: CanvasRenderingContext2D) {
  const ink = '#302331';
  function roundedPath(x: number, y: number, w: number, h: number, r: number) {
    // arcTo keeps the artwork available on browsers predating Canvas.roundRect.
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
  function rounded(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill?: string,
    stroke?: string,
    line = 2
  ) {
    roundedPath(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = line;
      ctx.stroke();
    }
  }
  function ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    fill?: string,
    stroke?: string,
    line = 2
  ) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = line;
      ctx.stroke();
    }
  }
  function path(points: PathCommand[], fill?: string, stroke?: string, line = 2) {
    ctx.beginPath();
    for (const command of points) {
      switch (command[0]) {
        case 'moveTo':
          ctx.moveTo(command[1], command[2]);
          break;
        case 'lineTo':
          ctx.lineTo(command[1], command[2]);
          break;
        case 'quadraticCurveTo':
          ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]);
          break;
        case 'bezierCurveTo':
          ctx.bezierCurveTo(command[1], command[2], command[3], command[4], command[5], command[6]);
          break;
        case 'closePath':
          ctx.closePath();
          break;
      }
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = line;
      ctx.stroke();
    }
  }
  function line(points: PathCommand[], color: string, weight = 2) {
    path(points, undefined, color, weight);
  }
  function star(x: number, y: number, size: number, color: string, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    path(
      [
        ['moveTo', x, y - size],
        ['quadraticCurveTo', x + 1, y - 1, x + size, y],
        ['quadraticCurveTo', x + 1, y + 1, x, y + size],
        ['quadraticCurveTo', x - 1, y + 1, x - size, y],
        ['quadraticCurveTo', x - 1, y - 1, x, y - size],
      ],
      color
    );
    ctx.restore();
  }
  function receipt(x: number, y: number, color: string, angle = 0, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    path(
      [
        ['moveTo', -10, -17],
        ['lineTo', 10, -17],
        ['lineTo', 10, 15],
        ['lineTo', 5, 12],
        ['lineTo', 0, 15],
        ['lineTo', -5, 12],
        ['lineTo', -10, 15],
        ['closePath'],
      ],
      '#fff1d9',
      ink,
      1.8
    );
    rounded(-7, -13, 14, 6, 1.5, color);
    line(
      [
        ['moveTo', -5, -2],
        ['lineTo', 5, -2],
      ],
      '#6d6170',
      1.7
    );
    line(
      [
        ['moveTo', -5, 3],
        ['lineTo', 2, 3],
      ],
      '#a69a99',
      1.5
    );
    ellipse(5, 8, 2, 2, color);
    ctx.restore();
  }
  function cat(
    x: number,
    y: number,
    facing: number,
    step: number,
    walking: boolean,
    collect: boolean,
    celebrate: boolean,
    time: number,
    receipts: { ubereats?: StorefrontStatus; doordash?: StorefrontStatus } = {}
  ) {
    const fur = '#efb879',
      light = '#ffdeaa',
      stripe = '#c98450';
    const bob = walking ? Math.sin(step * 2) * 1.6 : Math.sin(time * 2) * 0.7;
    ellipse(x, y + 2, 33, 5, '#020813');
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(facing, 1);
    // Curled tail follows the walk, with a cream tip.
    const wag = Math.sin(time * 4) * 3;
    const tail: PathCommand[] = [
      ['moveTo', -24, -24],
      ['bezierCurveTo', -51, -21, -51, -49 + wag, -41, -52 + wag],
    ];
    line(tail, ink, 12);
    line(tail, fur, 8);
    line(
      [
        ['moveTo', -44, -47 + wag],
        ['quadraticCurveTo', -45, -52 + wag, -41, -52 + wag],
      ],
      light,
      8
    );
    // Back legs, then body, then the near legs.
    const swing = walking ? Math.sin(step) * 10 : 0;
    line(
      [
        ['moveTo', -16, -18],
        ['lineTo', -15 - swing, -4],
        ['lineTo', -9 - swing, -3],
      ],
      ink,
      9
    );
    line(
      [
        ['moveTo', -16, -18],
        ['lineTo', -15 - swing, -4],
        ['lineTo', -9 - swing, -3],
      ],
      stripe,
      5.5
    );
    line(
      [
        ['moveTo', 19, -19],
        ['lineTo', 18 + swing, -4],
        ['lineTo', 24 + swing, -3],
      ],
      ink,
      9
    );
    line(
      [
        ['moveTo', 19, -19],
        ['lineTo', 18 + swing, -4],
        ['lineTo', 24 + swing, -3],
      ],
      stripe,
      5.5
    );
    ellipse(0, -27, 31, 20, fur, ink, 2.5);
    ellipse(13, -23, 14, 12, light);
    line(
      [
        ['moveTo', -16, -19],
        ['lineTo', -16 + swing, -2],
        ['lineTo', -8 + swing, -2],
      ],
      ink,
      9
    );
    line(
      [
        ['moveTo', -16, -19],
        ['lineTo', -16 + swing, -2],
        ['lineTo', -8 + swing, -2],
      ],
      fur,
      5.5
    );
    if (collect) {
      line(
        [
          ['moveTo', 22, -22],
          ['quadraticCurveTo', 39, -28, 35, -38],
        ],
        ink,
        9
      );
      line(
        [
          ['moveTo', 22, -22],
          ['quadraticCurveTo', 39, -28, 35, -38],
        ],
        light,
        5.5
      );
    } else {
      line(
        [
          ['moveTo', 23, -18],
          ['lineTo', 21 - swing, -2],
          ['lineTo', 29 - swing, -2],
        ],
        ink,
        9
      );
      line(
        [
          ['moveTo', 23, -18],
          ['lineTo', 21 - swing, -2],
          ['lineTo', 29 - swing, -2],
        ],
        light,
        5.5
      );
    }
    // Oversized soft head, pointed ears, and a curious face.
    path(
      [
        ['moveTo', 7, -48],
        ['lineTo', 7, -72],
        ['quadraticCurveTo', 10, -75, 22, -60],
        ['quadraticCurveTo', 28, -62, 33, -58],
        ['lineTo', 45, -74],
        ['quadraticCurveTo', 48, -72, 47, -48],
        ['quadraticCurveTo', 59, -22, 31, -20],
        ['quadraticCurveTo', 3, -20, 7, -48],
      ],
      fur,
      ink,
      2.5
    );
    path(
      [
        ['moveTo', 11, -64],
        ['lineTo', 12, -52],
        ['lineTo', 20, -57],
      ],
      '#e8928c'
    );
    path(
      [
        ['moveTo', 43, -65],
        ['lineTo', 36, -57],
        ['lineTo', 44, -52],
      ],
      '#e8928c'
    );
    ellipse(33, -34, 17, 11, light);
    line(
      [
        ['moveTo', 23, -58],
        ['lineTo', 24, -52],
      ],
      stripe,
      3
    );
    line(
      [
        ['moveTo', 30, -58],
        ['lineTo', 30, -52],
      ],
      stripe,
      3
    );
    const blink = time % 4.6 > 4.38;
    if (blink || celebrate) {
      line(
        [
          ['moveTo', 19, -43],
          ['quadraticCurveTo', 23, -47, 26, -43],
        ],
        ink,
        2.2
      );
      line(
        [
          ['moveTo', 36, -43],
          ['quadraticCurveTo', 40, -47, 43, -43],
        ],
        ink,
        2.2
      );
    } else {
      ellipse(23, -43, 2.1, 3, ink);
      ellipse(40, -43, 2.1, 3, ink);
    }
    path(
      [
        ['moveTo', 29, -37],
        ['quadraticCurveTo', 33, -39, 36, -36],
        ['lineTo', 32, -33],
        ['closePath'],
      ],
      '#80525a'
    );
    line(
      [
        ['moveTo', 32, -33],
        ['quadraticCurveTo', 29, -27, 26, -31],
        ['moveTo', 32, -33],
        ['quadraticCurveTo', 36, -28, 39, -31],
      ],
      ink,
      1.4
    );
    ellipse(15, -34, 4, 2, '#e89d86');
    ellipse(47, -33, 3.4, 2, '#e89d86');
    line(
      [
        ['moveTo', 11, -36],
        ['lineTo', 3, -39],
        ['moveTo', 11, -32],
        ['lineTo', 3, -32],
        ['moveTo', 48, -36],
        ['lineTo', 56, -38],
        ['moveTo', 48, -32],
        ['lineTo', 56, -32],
      ],
      '#826354',
      1.2
    );
    // Dinder's coral satchel, with collected slips poking out.
    line(
      [
        ['moveTo', -19, -43],
        ['quadraticCurveTo', 3, -49, 11, -25],
      ],
      '#ff6f83',
      5
    );
    if (receipts.ubereats === 'resolved') receipt(-12, -35, '#6cdc9a', -0.18, 0.48);
    if (receipts.doordash === 'resolved') receipt(-1, -36, '#ff8e7d', 0.13, 0.48);
    rounded(-24, -33, 30, 25, 7, '#EA7058', ink, 2.5);
    rounded(-24, -33, 30, 9, 5, '#ff99a8', ink, 1.5);
    ellipse(-8, -22, 2, 2, '#ffe5cc');
    line(
      [
        ['moveTo', -17, -15],
        ['lineTo', -9, -15],
      ],
      '#b74764',
      1.6
    );
    ctx.restore();
  }
  return { roundedPath, rounded, ellipse, path, line, star, receipt, cat };
}
