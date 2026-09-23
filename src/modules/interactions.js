import { gsap } from "gsap";


/**
 * Magnetic elements.
 * Button 34% offset kheenchta hai, uska label 18% — control ke andar parallax.
 * Radius element ke size se scale hota hai, warna bade button pe effect chhota lagta hai.
 */
export function initMagnetic(root = document) {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  root.querySelectorAll("[data-magnetic]").forEach((el) => {
    const label = el.querySelector("span");
    const ex = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3" });
    const ey = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3" });
    const lx = label ? gsap.quickTo(label, "x", { duration: 0.65, ease: "power3" }) : null;
    const ly = label ? gsap.quickTo(label, "y", { duration: 0.65, ease: "power3" }) : null;

    let radius = 130;
    const measure = () => {
      const b = el.getBoundingClientRect();
      radius = Math.max(120, Math.max(b.width, b.height) * 0.9);
    };
    measure();
    addEventListener("resize", measure, { passive: true });

    const move = (e) => {
      const b = el.getBoundingClientRect();
      const ox = e.clientX - (b.left + b.width / 2);
      const oy = e.clientY - (b.top + b.height / 2);
      if (Math.hypot(ox, oy) > radius) return reset();
      ex(ox * 0.34); ey(oy * 0.34);
      if (lx) { lx(ox * 0.18); ly(oy * 0.18); }
    };
    const reset = () => {
      ex(0); ey(0);
      if (lx) { lx(0); ly(0); }
    };

    // window par sunte hain, element par nahi — tabhi button cursor ke *paas*
    // aane par react karta hai, sirf hover par nahi. Yahi asli magnetism hai.
    addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", reset);
  });
}

/** Number counter — ScrollTrigger se trigger hota hai */
export function countUp(el, value, { decimals = 0, suffix = "" } = {}) {
  const obj = { v: 0 };
  return gsap.to(obj, {
    v: value,
    duration: 1.9,
    ease: "power3.out",
    onUpdate() {
      el.textContent = obj.v.toFixed(decimals) + suffix;
    },
  });
}
