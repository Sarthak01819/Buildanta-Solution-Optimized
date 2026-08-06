import { gsap } from "gsap";

/**
 * Har intro step ka apna illustrated scene.
 *
 * Ye inline SVG hain, raster images nahi — jaan-boojhkar:
 *   · zero network (standalone build offline chalti hai)
 *   · har size par crisp
 *   · har stroke alag se animate ho sakta hai (image ke saath nahi hota)
 *
 * Sab ek hi visual bhasha mein: 1.5px hairline strokes, no fill,
 * ink + brass — bilkul intro ke type jaisa.
 */

const S = 'stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const B = 'stroke="var(--brass)" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

export const SCENES = {
  /* ── 01 · sochna: bulb banta hai, khayal orbit karte hain ── */
  idea: `
  <svg viewBox="0 0 400 330" class="scene scene--idea" aria-hidden="true">
    <g class="sc-rays">
      ${[0, 45, 90, 135, 180, 225, 270, 315]
        .map((a) => {
          const r = (a * Math.PI) / 180;
          const x = 200 + Math.cos(r - Math.PI / 2) * 78, y = 132 + Math.sin(r - Math.PI / 2) * 78;
          const x2 = 200 + Math.cos(r - Math.PI / 2) * 96, y2 = 132 + Math.sin(r - Math.PI / 2) * 96;
          return `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${B} />`;
        })
        .join("")}
    </g>
    <circle class="sc-glass" cx="200" cy="132" r="54" ${S} />
    <path class="sc-neck" d="M176 180 L176 198 Q176 205 183 205 L217 205 Q224 205 224 198 L224 180" ${S} />
    <line class="sc-b1" x1="180" y1="215" x2="220" y2="215" ${S} />
    <line class="sc-b2" x1="184" y1="225" x2="216" y2="225" ${S} />
    <path class="sc-fil" d="M184 148 Q192 122 200 140 Q208 158 216 132" ${B} />
    <g class="sc-orbit">
      <circle cx="200" cy="132" r="96" ${B} stroke-dasharray="2 9" opacity=".55" />
    </g>
    <circle class="sc-spark sc-spark--1" cx="296" cy="132" r="4" fill="var(--brass)" stroke="none" />
    <circle class="sc-spark sc-spark--2" cx="104" cy="132" r="3" fill="currentColor" stroke="none" />
    <g class="sc-notes">
      <line x1="58" y1="268" x2="150" y2="268" ${S} opacity=".5" />
      <line x1="58" y1="284" x2="118" y2="284" ${S} opacity=".5" />
      <line x1="250" y1="268" x2="342" y2="268" ${S} opacity=".5" />
    </g>
  </svg>`,

  /* ── 02 · coding: editor window, lines type hoti hain ── */
  code: `
  <svg viewBox="0 0 400 330" class="scene scene--code" aria-hidden="true">
    <rect class="sc-win" x="34" y="48" width="332" height="234" rx="7" ${S} />
    <line class="sc-bar" x1="34" y1="80" x2="366" y2="80" ${S} />
    <circle class="sc-dot" cx="52" cy="64" r="4" ${S} />
    <circle class="sc-dot" cx="68" cy="64" r="4" ${S} />
    <circle class="sc-dot" cx="84" cy="64" r="4" ${B} />
    <line class="sc-gutter" x1="72" y1="80" x2="72" y2="282" ${S} opacity=".45" />
    <g class="sc-code">
      ${[
        [0, 24, 78], [1, 44, 120], [2, 58, 64], [3, 44, 96],
        [4, 24, 108], [5, 44, 72], [6, 58, 86], [7, 24, 54],
      ]
        .map(([i, indent, w]) => {
          const y = 102 + i * 22;
          const accent = i === 1 || i === 5;
          return `<line class="sc-line" x1="${88 + indent}" y1="${y}" x2="${88 + indent + w}" y2="${y}"
            stroke="${accent ? "var(--brass)" : "currentColor"}" stroke-width="4" stroke-linecap="round" opacity=".75" />
          <line class="sc-num" x1="52" y1="${y}" x2="62" y2="${y}" ${S} opacity=".35" />`;
        })
        .join("")}
    </g>
    <rect class="sc-caret" x="88" y="270" width="9" height="3" fill="var(--brass)" stroke="none" />
    <path class="sc-brk sc-brk--l" d="M228 300 q-12 0 -12 10 t-12 10 q12 0 12 10 t12 10" ${S} opacity=".5" />
    <path class="sc-brk sc-brk--r" d="M262 300 q12 0 12 10 t12 10 q-12 0 -12 10 t-12 10" ${S} opacity=".5" />
  </svg>`,

  /* ── 03 · market: bars uthte hain, trend line + reach arcs ── */
  market: `
  <svg viewBox="0 0 400 330" class="scene scene--market" aria-hidden="true">
    <line class="sc-axis sc-axis--y" x1="62" y1="46" x2="62" y2="248" ${S} opacity=".5" />
    <line class="sc-axis sc-axis--x" x1="62" y1="248" x2="356" y2="248" ${S} opacity=".5" />
    <g class="sc-bars">
      ${[[92, 62], [140, 96], [188, 78], [236, 134], [284, 174]]
        .map(([x, hgt], i) => {
          const accent = i === 4;
          return `<rect class="sc-bar" x="${x}" y="${248 - hgt}" width="30" height="${hgt}" rx="2"
            stroke="${accent ? "var(--brass)" : "currentColor"}" fill="none" stroke-width="1.5" />`;
        })
        .join("")}
    </g>
    <path class="sc-trend" d="M78 214 L122 186 L170 196 L218 148 L266 114 L318 78" ${B} />
    <path class="sc-arrow" d="M304 74 L320 76 L316 92" ${B} />
    <g class="sc-reach">
      <path class="sc-arc" d="M330 196 a34 34 0 0 1 0 -48" ${S} opacity=".45" />
      <path class="sc-arc" d="M344 208 a52 52 0 0 1 0 -72" ${S} opacity=".3" />
    </g>
    <!-- money: sikkon ki dher, ₹, aur upar jaate hue value ticks.
         Y values axis (248) ke upar rakhe hain — chart layout full-bleed hai,
         isliye viewBox ka neechla hissa footer ke peeche chala jaata hai. -->
    <g class="sc-money">
      ${[236, 225, 214].map((cy, i) =>
        `<ellipse class="sc-coin" cx="104" cy="${cy}" rx="24" ry="8"
          stroke="var(--money)" fill="none" stroke-width="1.5" opacity="${0.55 + i * 0.18}" />`).join("")}
      <circle class="sc-rupee" cx="186" cy="222" r="19" stroke="var(--money)" fill="none" stroke-width="1.5" />
      <text class="sc-rsym" x="186" y="229" text-anchor="middle"
        font-size="19" font-family="inherit" fill="var(--money)" stroke="none">&#8377;</text>
      <g class="sc-ticks">
        ${[236, 258, 280].map((x, i) =>
          `<path class="sc-tick" d="M${x} ${232 - i * 5} L${x + 7} ${221 - i * 6} L${x + 14} ${228 - i * 5}"
            stroke="var(--money)" fill="none" stroke-width="1.5" stroke-linecap="round"
            stroke-linejoin="round" opacity="${0.45 + i * 0.2}" />`).join("")}
      </g>
    </g>
  </svg>`,

  /* ── 04 · consult: gauge bharta hai, checklist tick hoti hai ── */
  consult: `
  <svg viewBox="0 0 400 330" class="scene scene--consult" aria-hidden="true">
    <circle class="sc-ring-bg" cx="132" cy="140" r="62" ${S} opacity=".28" />
    <circle class="sc-ring" cx="132" cy="140" r="62" ${B} transform="rotate(-90 132 140)" />
    <path class="sc-tickbig" d="M112 140 L127 155 L156 124" ${B} />
    <g class="sc-rows">
      ${[0, 1, 2].map((i) => {
        const y = 106 + i * 44;
        return `<rect class="sc-card" x="228" y="${y - 16}" width="136" height="34" rx="4" ${S} opacity=".4" />
        <path class="sc-check" d="M240 ${y} L247 ${y + 7} L260 ${y - 8}" ${B} />
        <line class="sc-txt" x1="272" y1="${y}" x2="${272 + [66, 48, 74][i]}" y2="${y}" ${S} opacity=".5" />`;
      }).join("")}
    </g>
    <!-- orient: compass — consulting ka kaam disha dena hai -->
    <g class="sc-compass">
      <circle class="sc-cring" cx="132" cy="266" r="46" ${S} opacity=".42" />
      <circle class="sc-cring2" cx="132" cy="266" r="36" ${S} opacity=".22" />
      ${[0, 90, 180, 270].map((a) => {
        const r = (a * Math.PI) / 180;
        const x1 = 132 + Math.cos(r) * 46, y1 = 266 + Math.sin(r) * 46;
        const x2 = 132 + Math.cos(r) * 38, y2 = 266 + Math.sin(r) * 38;
        return `<line class="sc-cmark" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${S} opacity=".55" />`;
      }).join("")}
      <g class="sc-needle">
        <path d="M132 236 L142 266 L132 296 L122 266 Z" ${B} />
        <circle cx="132" cy="266" r="3.5" fill="var(--brass)" stroke="none" />
      </g>
    </g>
    <line class="sc-base" x1="240" y1="264" x2="356" y2="264" ${S} opacity=".35" />
    <line class="sc-base" x1="240" y1="280" x2="318" y2="280" ${S} opacity=".35" />
  </svg>`,
};

/** stroke ko "draw" karna — GSAP ka DrawSVG paid hai, ye free equivalent hai */
function draw(el, tl, pos, dur = 0.85, ease = "power2.out") {
  if (!el || !el.getTotalLength) return;
  const len = el.getTotalLength() || 1;
  gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
  tl.to(el, { strokeDashoffset: 0, duration: dur, ease }, pos);
}

const q = (root, sel) => [...root.querySelectorAll(sel)];

/**
 * Ek scene ke liye timeline banata hai. Sab scenes ~1.9s mein settle
 * ho jaate hain taaki step ke hold ke andar poore dikh jayein.
 *
 * IMPORTANT: ambient loops (orbit, caret blink) is timeline mein NAHI
 * jaate. GSAP mein `repeat: -1` wala child parent ki duration infinite
 * kar deta hai — jisse intro ka poora progress/skip logic toot jaata.
 * Wo alag standalone tweens hain, `loops` array mein collect hote hain
 * taaki baad mein kill kiye ja sakein.
 */
export function buildScene(root, id, loops = []) {
  const tl = gsap.timeline();
  const svg = root.querySelector(".scene");
  if (!svg) return tl;

  gsap.set(svg, { opacity: 0 });
  tl.to(svg, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0);

  if (id === "idea") {
    draw(svg.querySelector(".sc-glass"), tl, 0.05, 0.9);
    draw(svg.querySelector(".sc-neck"), tl, 0.55, 0.5);
    q(svg, ".sc-b1, .sc-b2").forEach((el, i) => draw(el, tl, 0.72 + i * 0.08, 0.35));
    draw(svg.querySelector(".sc-fil"), tl, 0.8, 0.7);
    tl.from(q(svg, ".sc-rays line"), {
      scale: 0, opacity: 0, transformOrigin: "50% 50%",
      duration: 0.5, ease: "back.out(2)", stagger: 0.045,
    }, 0.95);
    tl.from(svg.querySelector(".sc-orbit"), { opacity: 0, duration: 0.6 }, 1.1);
    loops.push(gsap.to(svg.querySelector(".sc-orbit"), {
      rotation: 360, transformOrigin: "200px 132px",
      duration: 26, ease: "none", repeat: -1,
    }));
    tl.from(q(svg, ".sc-spark"), { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(3)", stagger: 0.12 }, 1.2);
    tl.from(q(svg, ".sc-notes line"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.5, ease: "power2.out", stagger: 0.09 }, 1.15);
  }

  if (id === "code") {
    draw(svg.querySelector(".sc-win"), tl, 0.05, 1);
    draw(svg.querySelector(".sc-bar"), tl, 0.5, 0.4);
    tl.from(q(svg, ".sc-dot"), { scale: 0, opacity: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "back.out(3)", stagger: 0.07 }, 0.55);
    draw(svg.querySelector(".sc-gutter"), tl, 0.6, 0.5);
    // lines "type" hoti hain — left se right, ek ke baad ek
    tl.from(q(svg, ".sc-line"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.3, ease: "power2.out", stagger: 0.075 }, 0.72);
    tl.from(q(svg, ".sc-num"), { opacity: 0, duration: 0.2, stagger: 0.075 }, 0.72);
    // caret last line ke saath blink karta hai
    tl.fromTo(svg.querySelector(".sc-caret"), { opacity: 0 }, { opacity: 1, duration: 0.1 }, 1.35);
    loops.push(gsap.to(svg.querySelector(".sc-caret"), {
      opacity: 0, duration: 0.1, repeat: -1, yoyo: true, repeatDelay: 0.45, delay: 1.5,
    }));
    q(svg, ".sc-brk").forEach((el, i) => draw(el, tl, 1.2 + i * 0.12, 0.6));
  }

  if (id === "market") {
    draw(svg.querySelector(".sc-axis--y"), tl, 0.05, 0.5);
    draw(svg.querySelector(".sc-axis--x"), tl, 0.2, 0.5);
    tl.from(q(svg, ".sc-bars rect"), {
      scaleY: 0, transformOrigin: "50% 100%", duration: 0.7,
      ease: "power3.out", stagger: 0.09,
    }, 0.4);
    draw(svg.querySelector(".sc-trend"), tl, 0.85, 1.1);
    draw(svg.querySelector(".sc-arrow"), tl, 1.7, 0.35);
    q(svg, ".sc-arc").forEach((el, i) => draw(el, tl, 1.15 + i * 0.14, 0.6));
    // money: sikke neeche se dher lagte hain, ₹ pop hota hai, ticks upar chadhte hain
    tl.from(q(svg, ".sc-coin"), { y: 14, opacity: 0, duration: 0.45, ease: "back.out(2)", stagger: 0.1 }, 1.0);
    tl.from([svg.querySelector(".sc-rupee"), svg.querySelector(".sc-rsym")], {
      scale: 0, opacity: 0, transformOrigin: "186px 222px", duration: 0.5, ease: "back.out(2.6)",
    }, 1.25);
    tl.from(q(svg, ".sc-tick"), { y: 10, opacity: 0, duration: 0.4, ease: "power3.out", stagger: 0.09 }, 1.4);
  }

  if (id === "consult") {
    draw(svg.querySelector(".sc-ring-bg"), tl, 0.05, 0.7);
    // gauge 78% tak bharta hai
    const ring = svg.querySelector(".sc-ring");
    if (ring) {
      const len = ring.getTotalLength();
      gsap.set(ring, { strokeDasharray: len, strokeDashoffset: len });
      tl.to(ring, { strokeDashoffset: len * 0.22, duration: 1.25, ease: "power2.inOut" }, 0.35);
    }
    draw(svg.querySelector(".sc-tickbig"), tl, 1.25, 0.45);
    tl.from(q(svg, ".sc-card"), { scaleX: 0, opacity: 0, transformOrigin: "0% 50%", duration: 0.5, ease: "power3.out", stagger: 0.11 }, 0.5);
    q(svg, ".sc-check").forEach((el, i) => draw(el, tl, 0.75 + i * 0.16, 0.4));
    tl.from(q(svg, ".sc-txt"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.45, ease: "power2.out", stagger: 0.11 }, 0.8);
    // compass: rings draw hote hain, marks pop karte hain, needle ghoomkar settle
    draw(svg.querySelector(".sc-cring"), tl, 0.95, 0.8);
    draw(svg.querySelector(".sc-cring2"), tl, 1.15, 0.6);
    tl.from(q(svg, ".sc-cmark"), { scale: 0, opacity: 0, transformOrigin: "132px 266px", duration: 0.35, ease: "back.out(2)", stagger: 0.06 }, 1.25);
    tl.from(svg.querySelector(".sc-needle"), {
      rotation: -150, opacity: 0, transformOrigin: "132px 266px",
      duration: 1.15, ease: "elastic.out(1, 0.62)",
    }, 1.35);
    tl.from(q(svg, ".sc-base"), { scaleX: 0, transformOrigin: "0% 50%", duration: 0.45, stagger: 0.09 }, 1.2);
  }

  return tl;
}
