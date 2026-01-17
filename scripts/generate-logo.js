const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// Register custom font - using a bold, modern sans-serif
const fontPath = path.join(__dirname, '../node_modules/canvas/node_modules/@aspect-build/canvas-darwin-arm64/fonts');

// Generate the Dinder logo based on "Kinetic Warmth" philosophy
function generateLogo() {
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background with rounded corners
  const cornerRadius = 220;

  // Create gradient - coral to sunset orange to dusty rose
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#FF6B6B');     // Coral
  gradient.addColorStop(0.4, '#FF8E53');   // Sunset orange
  gradient.addColorStop(0.7, '#FFA07A');   // Light salmon
  gradient.addColorStop(1, '#E8847C');     // Dusty rose

  // Draw rounded rectangle background
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(size - cornerRadius, 0);
  ctx.quadraticCurveTo(size, 0, size, cornerRadius);
  ctx.lineTo(size, size - cornerRadius);
  ctx.quadraticCurveTo(size, size, size - cornerRadius, size);
  ctx.lineTo(cornerRadius, size);
  ctx.quadraticCurveTo(0, size, 0, size - cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.quadraticCurveTo(0, 0, cornerRadius, 0);
  ctx.closePath();

  ctx.fillStyle = gradient;
  ctx.fill();

  // Add subtle inner glow
  const innerGlow = ctx.createRadialGradient(
    size * 0.3, size * 0.3, 0,
    size * 0.5, size * 0.5, size * 0.7
  );
  innerGlow.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  innerGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = innerGlow;
  ctx.fill();

  // Draw the stylized "D" with flame/swipe gesture
  ctx.save();
  ctx.translate(size / 2, size / 2);

  // Main "D" shape - white with slight shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 5;
  ctx.shadowOffsetY = 5;

  // Create the "D" as a custom path - combining dinner fork tine with swipe curve
  ctx.beginPath();

  // The vertical stem of D (like a fork handle)
  const stemWidth = 80;
  const stemHeight = 400;
  const stemX = -180;
  const stemY = -stemHeight / 2;

  // Draw stem with rounded top (like a match/flame base)
  ctx.moveTo(stemX, stemY + 30);
  ctx.quadraticCurveTo(stemX, stemY, stemX + stemWidth/2, stemY);
  ctx.quadraticCurveTo(stemX + stemWidth, stemY, stemX + stemWidth, stemY + 30);
  ctx.lineTo(stemX + stemWidth, stemY + stemHeight - 30);
  ctx.quadraticCurveTo(stemX + stemWidth, stemY + stemHeight, stemX + stemWidth/2, stemY + stemHeight);
  ctx.quadraticCurveTo(stemX, stemY + stemHeight, stemX, stemY + stemHeight - 30);
  ctx.closePath();

  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Draw the curved part of D (the swipe gesture / flame flicker)
  ctx.beginPath();

  // Swipe curve starting from the stem
  const curveStartY = -stemHeight / 2 + 30;
  const curveEndY = stemHeight / 2 - 30;
  const curveControlX = 280;

  ctx.moveTo(stemX + stemWidth - 10, curveStartY);

  // Top curve flowing out
  ctx.bezierCurveTo(
    stemX + stemWidth + 80, curveStartY - 40,    // Control 1
    curveControlX - 20, curveStartY + 60,        // Control 2
    curveControlX, 0                              // End point
  );

  // Bottom curve flowing back
  ctx.bezierCurveTo(
    curveControlX - 20, curveEndY - 60,          // Control 1
    stemX + stemWidth + 80, curveEndY + 40,      // Control 2
    stemX + stemWidth - 10, curveEndY            // End point
  );

  ctx.closePath();
  ctx.fill();

  // Add a small flame/spark accent at the top curve
  ctx.beginPath();
  const sparkX = 160;
  const sparkY = -120;
  const sparkSize = 25;

  ctx.arc(sparkX, sparkY, sparkSize, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  ctx.restore();

  // Save the main logo
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, '../frontend/public/dinder-logo.png'), buffer);
  console.log('Logo saved to frontend/public/dinder-logo.png');

  // Generate favicon version (smaller, simpler)
  const faviconSize = 512;
  const faviconCanvas = createCanvas(faviconSize, faviconSize);
  const fctx = faviconCanvas.getContext('2d');

  // Scale down the main logo
  fctx.drawImage(canvas, 0, 0, faviconSize, faviconSize);

  const faviconBuffer = faviconCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, '../frontend/public/favicon.png'), faviconBuffer);
  console.log('Favicon saved to frontend/public/favicon.png');

  // Generate small icon version
  const iconSize = 192;
  const iconCanvas = createCanvas(iconSize, iconSize);
  const ictx = iconCanvas.getContext('2d');
  ictx.drawImage(canvas, 0, 0, iconSize, iconSize);

  const iconBuffer = iconCanvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, '../frontend/public/dinder-icon-192.png'), iconBuffer);
  console.log('Icon (192px) saved to frontend/public/dinder-icon-192.png');
}

// Ensure public directory exists
const publicDir = path.join(__dirname, '../frontend/public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

generateLogo();
