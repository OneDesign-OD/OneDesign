// A small synthetic "landing page" mockup with known ground truth (exact
// colors, text, and bounding boxes), rendered to PNG at test-run-time via
// sharp rather than committing a binary fixture. Reused across the image
// pipeline's test script phases (region detection, color extraction,
// typography/layout, and the full end-to-end run) to sanity-check output
// against values we already know are correct.

export const SAMPLE_DESIGN = {
  width: 1200,
  height: 800,
  colors: {
    background: "#FFFFFF",
    nav: "#0B1220",
    navText: "#FFFFFF",
    heading: "#111827",
    body: "#4B5563",
    button: "#4F46E5",
    buttonText: "#FFFFFF",
    card: "#F3F4F6",
  },
  texts: {
    logo: "Acme",
    navLinks: ["Product", "Pricing"],
    heading: "Build faster with Acme",
    subheading: "Ship polished products in record time.",
    button: "Get Started",
    cardTitle: "Fast Setup",
    cardBody: "Deploy in minutes, not days.",
  },
  boxes: {
    nav: { x: 0, y: 0, width: 1200, height: 64 },
    button: { x: 80, y: 300, width: 180, height: 52 },
    card: { x: 80, y: 420, width: 360, height: 180 },
  },
} as const;

export function buildSampleDesignSvg(): string {
  const { width, height, colors, texts, boxes } = SAMPLE_DESIGN;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${colors.background}" />

  <rect x="${boxes.nav.x}" y="${boxes.nav.y}" width="${boxes.nav.width}" height="${boxes.nav.height}" fill="${colors.nav}" />
  <text x="32" y="40" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="${colors.navText}">${texts.logo}</text>
  <text x="1000" y="38" font-family="Arial, sans-serif" font-size="16" fill="${colors.navText}">${texts.navLinks[0]}</text>
  <text x="1090" y="38" font-family="Arial, sans-serif" font-size="16" fill="${colors.navText}">${texts.navLinks[1]}</text>

  <text x="80" y="210" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="${colors.heading}">${texts.heading}</text>
  <text x="80" y="250" font-family="Arial, sans-serif" font-size="18" fill="${colors.body}">${texts.subheading}</text>

  <rect x="${boxes.button.x}" y="${boxes.button.y}" width="${boxes.button.width}" height="${boxes.button.height}" rx="8" fill="${colors.button}" />
  <text x="120" y="334" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="${colors.buttonText}">${texts.button}</text>

  <rect x="${boxes.card.x}" y="${boxes.card.y}" width="${boxes.card.width}" height="${boxes.card.height}" rx="12" fill="${colors.card}" stroke="#E5E7EB" stroke-width="1" />
  <text x="110" y="465" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="${colors.heading}">${texts.cardTitle}</text>
  <text x="110" y="495" font-family="Arial, sans-serif" font-size="14" fill="${colors.body}">${texts.cardBody}</text>
</svg>
`.trim();
}
