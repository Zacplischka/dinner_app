import type { StorefrontStatus } from '@dinder/shared/types';
import { sceneDrawing } from './mascotDrawing';

/** Decorative motion only: receipt and storefront verdicts come from the stream. */
export function drawPricePatrol(
  ctx: CanvasRenderingContext2D,
  width: number,
  elapsed: number,
  ubereats?: StorefrontStatus,
  doordash?: StorefrontStatus
) {
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const ease = (t: number) => {
    t = clamp(t);
    return t * t * (3 - 2 * t);
  };
  const { roundedPath, rounded, ellipse, path, line, star, receipt, cat } = sceneDrawing(ctx);
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
  cat(0, 0, face, t * 11, walk, collect, party, t, { ubereats, doordash });
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
