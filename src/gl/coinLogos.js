import { CanvasTexture, SRGBColorSpace } from "three";
import CLAUDE_CODE_URL from "../assets/zero-stage/coin-logos/claude-code.svg?url";
import GEMINI_URL from "../assets/zero-stage/coin-logos/gemini.svg?url";
import CHATGPT_URL from "../assets/zero-stage/coin-logos/chatgpt.svg?url";
import CURSOR_URL from "../assets/zero-stage/coin-logos/cursor.svg?url";
import FACEBOOK_URL from "../assets/zero-stage/coin-logos/facebook.svg?url";
import INSTAGRAM_URL from "../assets/zero-stage/coin-logos/instagram.svg?url";
import HIGGSFIELD_URL from "../assets/zero-stage/coin-logos/higgsfield.svg?url";
import GROK_URL from "../assets/zero-stage/coin-logos/grok.svg?url";

// Array order is the physical orbit slot. Keep all eight slots so changing
// artwork cannot change pop timing, spin phases, spacing or the hand motion.
export const COIN_LOGOS = [
  { name: "Claude Code", url: CLAUDE_CODE_URL, size: 0.60 },
  { name: "Gemini", url: GEMINI_URL, size: 0.58 },
  { name: "ChatGPT", url: CHATGPT_URL, size: 0.60 },
  { name: "Cursor", url: CURSOR_URL, size: 0.58 },
  { name: "Facebook", url: FACEBOOK_URL, size: 0.60 },
  { name: "Instagram", url: INSTAGRAM_URL, size: 0.58 },
  { name: "Higgsfield", url: HIGGSFIELD_URL, size: 0.60 },
  { name: "Grok", url: GROK_URL, size: 0.62 },
];

// SVG masters stay editable. Rasterize once at load, never per animation
// frame: Three's cylinder caps sample this reusable, mipmapped face texture.
export function createCoinLogoTexture(image, logo, anisotropy = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Coin logo canvas is unavailable");

  // Retain the porcelain-white coin and subtle rounded rim. Branding is the
  // only changing content; the original cylinder sides remain untouched.
  const face = context.createRadialGradient(230, 218, 0, 256, 256, 256);
  face.addColorStop(0, "#ffffff");
  face.addColorStop(0.78, "#ffffff");
  face.addColorStop(0.92, "#f9f8f7");
  face.addColorStop(1, "#ece9e6");
  context.fillStyle = face;
  context.fillRect(0, 0, 512, 512);

  const width = image?.naturalWidth || image?.width || 0;
  const height = image?.naturalHeight || image?.height || 0;
  if (width > 0 && height > 0) {
    const scale = 512 * logo.size / Math.max(width, height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    context.drawImage(image, (512 - drawWidth) / 2, (512 - drawHeight) / 2,
      drawWidth, drawHeight);
  }

  const texture = new CanvasTexture(canvas);
  texture.name = `CoinLogo:${logo.name}`;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(8, Math.max(1, anisotropy));
  texture.userData.logoName = logo.name;
  texture.userData.sourceUrl = logo.url;
  texture.userData.logoReady = width > 0 && height > 0;
  return texture;
}
