import { gsap } from "gsap";

const GLYPHS = "▚▞▓▒░█<>/\\|=+*#@$%&_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Decode effect — text pehle random glyphs mein aata hai, phir
 * left se right settle hota hai. Terminal decrypt wala look.
 *
 * Har character ka apna settle point hai (`i / n * spread`), isliye
 * lehar chalti hai — sab ek saath resolve nahi hote.
 */
export function scrambleTo(el, text, { duration = 1.1, spread = 0.62, hold = 0.22 } = {}) {
  const n = text.length;
  const state = { p: 0 };

  return gsap.to(state, {
    p: 1,
    duration,
    ease: "none",
    onUpdate() {
      let out = "";
      for (let i = 0; i < n; i++) {
        const ch = text[i];
        if (ch === " ") { out += " "; continue; }

        const settle = (i / n) * spread;
        if (state.p >= settle + hold) out += ch;
        else if (state.p >= settle) out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    },
    onComplete() { el.textContent = text; },
  });
}

/** ScrollTrigger ke saath: element viewport mein aaye to decode ho */
export function initScramble(ScrollTrigger, root = document) {
  root.querySelectorAll("[data-scramble]").forEach((el) => {
    const text = el.textContent;
    el.setAttribute("aria-label", text);
    // shuru mein blank rakho — warna asli text ek frame ke liye flash karta hai
    el.textContent = "";

    ScrollTrigger.create({
      trigger: el,
      start: "top 92%",
      once: true,
      onEnter: () => scrambleTo(el, text, { duration: 0.9 + Math.random() * 0.5 }),
    });
  });
}
