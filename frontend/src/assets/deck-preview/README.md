# Illustrative Deck previews

These six images are decorative artwork for the deck-size stepper (#457), independent of the actual Deck. Generated with the built-in image generation tool on 2026-09-08; no provider requests or external image hosts are involved at runtime. Vite fingerprints the bundled WebP files.

The user approved the food-card preview and its mechanics before implementation. The food images are shared by Takeaway, Eat Out and Cook, with captions for each Branch. Watch uses three original fictional screen stories, including a series.

## Prompts and preparation

Common food prompt: square editorial restaurant food photography, close framing, natural texture, soft warm light, vibrant food against a dim blurred background; recognizable in a partially exposed card; no people, text, logos, borders or watermark.

- `pizza.webp`: Neapolitan margherita pizza, blistered crust, mozzarella, tomato and basil.
- `dumplings.webp`: golden pan-fried gyoza on dark ceramic, scallions and dipping sauce.
- `noodles.webp`: chilli oil noodles with greens, scallions and sesame.

Common Watch prompt: original cinematic illustration for a decorative group film/series card, portrait framing, detailed but readable at thumbnail size, main visual in the upper two thirds, no existing characters, franchise references, typography, logos, borders or watermark.

- `watch-orbit.webp`: lone astronaut on an amber desert ridge, huge blue planet and distant spacecraft; atmospheric science fiction.
- `watch-noir.webp`: solitary person with a red umbrella in a rainy neon city; teal reflections, warm shop windows, mystery thriller.
- `watch-summer.webp`: two friends seen from behind on a coastal hillside at golden hour; sea, wild grasses, nostalgic coming-of-age drama.

Food: approved 400px JPEG previews converted with `cwebp -q 78`. Watch: generated PNGs resized to 320px wide with `cwebp -q 76 -resize 320 0`. No image-generation credentials or source PNGs are shipped.
