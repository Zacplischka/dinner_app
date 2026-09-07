import type { StorefrontStatus } from '@dinder/shared/types';

type PathCommand =
  | ['moveTo' | 'lineTo', number, number]
  | ['quadraticCurveTo', number, number, number, number]
  | ['bezierCurveTo', number, number, number, number, number, number]
  | ['closePath'];

/** Decorative motion only: receipt and storefront verdicts come from the stream. */
export function drawPricePatrol(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsed: number,
  ubereats?: StorefrontStatus,
  doordash?: StorefrontStatus
) {
  const ink = '#302a39';
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const ease = (t: number) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
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
  function store(
    x: number,
    accent: string,
    dark: string,
    active: boolean,
    status?: StorefrontStatus
  ) {
    const w = width < 390 ? 82 : 108,
      left = x - w / 2;
    ctx.save();
    ellipse(x, 190, w * 0.65, 5, '#030913');
    rounded(left, 68, w, 114, 10, '#142335', '#25394c', 1.5);
    rounded(left + 4, 72, w - 8, 28, 6, dark);
    // Striped awning, lit windows, and a small pavement step.
    rounded(left - 5, 106, w + 10, 18, 4, accent);
    ctx.save();
    roundedPath(left - 5, 106, w + 10, 18, 4);
    ctx.clip();
    ctx.globalAlpha = 0.21;
    ctx.fillStyle = '#fff3dd';
    for (let i = 0; i < 6; i++) ctx.fillRect(left - 5 + (i * (w + 10)) / 6, 106, (w + 10) / 12, 18);
    ctx.restore();
    rounded(left + 10, 134, w * 0.33, 30, 4, active ? '#ffe6b3' : '#8eb7b320', '#31514f', 1);
    line(
      [
        ['moveTo', left + 10 + w * 0.165, 134],
        ['lineTo', left + 10 + w * 0.165, 164],
      ],
      '#31514f',
      1
    );
    rounded(x + 5, 130, w * 0.31, 52, 4, '#0b1525', '#33495b', 1.5);
    rounded(x + 9, 135, w * 0.31 - 8, 23, 2, active ? '#ffe6b336' : '#23374b');
    ellipse(x + 12, 166, 1.5, 1.5, accent);
    rounded(left - 5, 182, w + 10, 5, 2, '#2a3b4e');
    if (active) {
      ctx.globalAlpha = 0.12;
      ellipse(x, 206, w * 0.8, 12, accent);
      ctx.globalAlpha = 1;
    }
    if (status) {
      const missing = status !== 'resolved';
      ellipse(x + w / 2 - 1, 64, 10, 10, missing ? '#3c302d' : '#173c32', '#080f1e', 3);
      if (missing)
        line(
          [
            ['moveTo', x + w / 2 - 5, 64],
            ['lineTo', x + w / 2 + 3, 64],
          ],
          '#eac0a2',
          2
        );
      else
        line(
          [
            ['moveTo', x + w / 2 - 5, 64],
            ['lineTo', x + w / 2 - 2, 67],
            ['lineTo', x + w / 2 + 3, 61],
          ],
          '#9ef1bb',
          2
        );
    }
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
    time: number
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
    if (ubereats === 'resolved') receipt(-12, -35, '#6cdc9a', -0.18, 0.48);
    if (doordash === 'resolved') receipt(-1, -36, '#ff8e7d', 0.13, 0.48);
    rounded(-24, -33, 30, 25, 7, '#ff7589', ink, 2.5);
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
  const t = elapsed % 13.2,
    left = width * 0.19,
    right = width * 0.81,
    mid = width * 0.5;
  const stopLeft = left + 17,
    stopRight = right - 28,
    scale = width < 400 ? 0.82 : 1;
  ctx.clearRect(0, 0, width, 245);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // A quiet evening street behind the courier.
  const halo = ctx.createRadialGradient(mid, 151, 10, mid, 151, width * 0.55);
  halo.addColorStop(0, '#20354845');
  halo.addColorStop(1, '#14223100');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, 245);
  ellipse(mid - 9, 51, 17, 17, '#ffdeb310');
  path(
    [
      ['moveTo', mid - 4, 36],
      ['bezierCurveTo', mid - 26, 38, mid - 29, 65, mid - 5, 66],
      ['bezierCurveTo', mid - 18, 57, mid - 14, 42, mid - 4, 36],
    ],
    '#ffe3b7'
  );
  star(mid + 43, 47, 3, '#849bad', 0.6);
  star(mid - 51, 72, 2, '#849bad', 0.5);
  line(
    [
      ['moveTo', 12, 207],
      ['quadraticCurveTo', mid, 219, width - 12, 207],
    ],
    '#29394a',
    1
  );
  for (let i = 0; i < 5; i++) rounded(mid - 42 + i * 21, 227 + (i % 2) * 2, 6, 2, 1, '#253344');
  store(left, '#65c796', '#163b32', !ubereats && t > 2.7 && t < 4.6, ubereats);
  store(right, '#eb8574', '#482d2f', !doordash && t > 6.9 && t < 8.8, doordash);
  let x = mid,
    face = -1,
    walk = false,
    collect = false;
  if (t < 0.5) x = mid;
  else if (t < 3.1) {
    x = mix(mid, stopLeft, ease((t - 0.5) / 2.6));
    walk = true;
  } else if (t < 4.5) {
    x = stopLeft;
    collect = t > 3.25 && t < 4.3;
  } else if (t < 7.2) {
    x = mix(stopLeft, stopRight, ease((t - 4.5) / 2.7));
    face = 1;
    walk = true;
  } else if (t < 8.6) {
    x = stopRight;
    face = 1;
    collect = t > 7.35 && t < 8.4;
  } else if (t < 10.6) {
    x = mix(stopRight, mid, ease((t - 8.6) / 2));
    face = -1;
    walk = true;
  } else {
    x = mid;
    face = 1;
  }
  const settled = Boolean(ubereats && doordash);
  const party = settled && (ubereats === 'resolved' || doordash === 'resolved');
  if (settled) {
    x = mid;
    face = 1;
    walk = false;
    collect = false;
  }
  // Small footsteps fade behind the courier.
  if (walk)
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = (1 - i / 4) * 0.16;
      ellipse(x - face * (34 + i * 13) * scale, 206 + (i % 2) * 3, 2.5, 1.5, '#edc59c');
    }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(x, 204);
  ctx.scale(scale, scale);
  cat(0, 0, face, t * 11, walk, collect, party, t);
  ctx.restore();
  function collectSlip(start: number, end: number, shop: number, color: string) {
    if (t < start || t > end) return;
    const p = clamp((t - start) / (end - start)),
      q = ease(p);
    receipt(
      mix(shop, x - face * 9, q),
      mix(137, 170, q) - Math.sin(p * Math.PI) * 52,
      color,
      mix(-0.15, 0.25, q),
      mix(0.8, 0.48, p)
    );
    if (p > 0.3 && p < 0.8) star(shop + 18, 106, 5, color, Math.sin(((p - 0.3) * Math.PI) / 0.5));
  }
  if (ubereats === 'resolved' && !settled) collectSlip(3.3, 4.3, left, '#65c796');
  if (doordash === 'resolved' && !settled) collectSlip(7.4, 8.4, right, '#eb8574');
  if (party) {
    const wobble = Math.sin(t * 3) * 0.06;
    if (ubereats === 'resolved') receipt(mid - 28, 100, '#65c796', -0.23 + wobble, 0.85);
    if (doordash === 'resolved') receipt(mid + 8, 93, '#eb8574', 0.16 - wobble, 0.85);
    star(mid - 53, 108, 4, '#ffd69d');
    star(mid + 40, 89, 5, '#ff8e9f');
    star(mid + 35, 118, 2.5, '#9be4ba');
  }
}
