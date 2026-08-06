/**
 * ─────────────────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH
 *  Sirf yahi file edit karo. Brand, products, sections, contact —
 *  sab kuch yahan se aata hai. Kahin aur hardcoded nahi hai.
 * ─────────────────────────────────────────────────────────────
 */

/* Intro ke chaar full-screen scene. Vite inhe hash karke bundle karta hai,
   isliye path yahan import se aata hai — string se nahi. */
import ideaImg from "./assets/intro/idea.webp";
import codeImg from "./assets/intro/code.webp";
import marketImg from "./assets/intro/market.webp";

export const BRAND = {
  name: "BUILDANTA",
  suffix: "SOLUTIONS",
  designation: "SYS.BLD-01",          // HUD mein dikhne wala unit id
  tagline: "We build the systems businesses run on.",
  intro:
    "Field ke sensors se lekar boardroom ke dashboards tak — hum wo infrastructure banate hain jispe rozana ka kaam chalta hai. Paanch deployed systems, ek engineering standard.",
  since: "2019",
  location: "IN · 19.07°N 72.87°E",
  email: "hello@buildanta.com",       // TODO: asli email
  phone: "+91 00000 00000",           // TODO: asli number
  socials: [
    { label: "LINKEDIN", href: "#" },
    { label: "GITHUB", href: "#" },
    { label: "X", href: "#" },
  ],
};

/**
 * PRE-HOME INTRO — SCROLL-DRIVEN 3D CORRIDOR
 * ──────────────────────────────────────────
 * Ye ad nahi hai. Koi timeline khud nahi chalti — `#intro` page ka pehla
 * section hai jise ScrollTrigger pin karta hai, aur scroll camera ko ek 3D
 * corridor mein aage badhata hai. Chaar "stations" hain; har station par us
 * act ki image ek plane ki tarah khadi hai aur headline uske saamne.
 *
 * Poora reversible hai — upar scroll karne par acts ulte chalte hain.
 * Isliye na ENTER button hai, na paper wipe, na `oncePerSession`: scroll
 * position hi ekmatr sach hai.
 *
 *   scrollPerAct → ek act ke liye kitna scroll (viewport heights mein).
 *                  1.1 = chaar acts ke liye ~4.4 screen ka scroll.
 *                  Ghatane par intro tez lagta hai par acts ke beech ka
 *                  transition jaldi kat jaata hai.
 */
export const INTRO = {
  scenes: true,            // station planes (false = sirf khaali corridor)
  themePerStep: true,      // har act ka palette usi image se aaya hai

  scrollPerAct: 1.1,

  /**
   * Sound: Web Audio se synthesize hota hai, koi file nahi. Level ab scroll
   * ki raftaar se bandha hai — tez scroll par filter khulta hai.
   *
   * Toggle phir bhi zaroori hai: Chrome `wheel` ko AudioContext unlock karne
   * wala valid gesture NAHI maanta (sirf pointer/touch/key hain), isliye
   * scroll karte rehne se awaaz apne aap nahi aayegi.
   */
  sound: { enabled: true, volume: 0.55 },   // naapa hua: 0.22 par RMS sirf 0.025 tha
  eyebrow: "An engineering studio",

  /**
   * TAGLINE KE AAS-PAAS TAIRTE OBJECTS
   * Headline ke chaaron taraf kuch halke glass/light objects, har act ke
   * apne material — jo usi image ki bhasha bolte hain.
   *
   * Bees materials maujood hain (`styles/objects.css`). Har act ka `objs`
   * ek MIX hai, ek hi cheez nahi: asli tasveeron mein bhi ek hero object
   * hota hai aur uske aas-paas alag, halke cheezein. Sab ek jaise ho to
   * layer flat lagti hai.
   *
   * Kam rakhna hi poora point hai — kul 5 se upar gaye to screen bhar
   * jaati hai aur wahi "bache ne kiya hai" wali feel wapas aa jaati hai.
   * 5 se zyada diye to extra chup-chaap gir jaate hain (sirf 5 slot hain).
   *
   * Slot ke size fixed hain, isi order mein: 9 · 6 · 11 · 5 · 4 vmin.
   * Isliye kram maayne rakhta hai — bade slot par soft/atmospheric cheez
   * daalo, chhote par bright point. Positions introObjects.js mein hain
   * (layout hai, content nahi).
   *
   *   objs    → { kind, count } ya [{ kind, count }, ...]
   *   drift   → idle float ka amplitude, px mein
   *   parallax→ pointer ke saath kitna hilein, px mein
   */
  objects: {
    enabled: false,
    drift: 14,
    parallax: 18,
  },

  /**
   * Har act: ek image, ek palette, ek camera move.
   *
   *   image  → src/assets/intro/ se import (Vite hash karke bundle karta hai)
   *   theme  → main.css ka #intro.t-* block; rang image se sample kiye hain
   *   layout → CSS class step--*; clip-path reveal aur camera move isse aate hain
   *   objs   → tagline ke aas-paas tairte objects
   */
  steps: [
    {
      n: "01",
      label: "Your idea",
      accent: "idea",
      layout: "idea",
      image: ideaImg,
      theme: "t-ember",        // warm cream · terracotta — glowing sphere se
      objs: [
        { kind: "idea-paper-plane", count: 1 },
        { kind: "idea-paper-ball", count: 1 },
        { kind: "idea-pencil", count: 1 },
        { kind: "idea-glass-marble", count: 1 },
        { kind: "idea-light-spark", count: 1 },
      ],
      sub: "Aap problem laate ho. Hum sawaal poochte hain — jab tak asli wajah saamne na aa jaye.",
    },
    {
      n: "02",
      label: "We code",
      accent: "code",
      layout: "code",
      image: codeImg,
      nativeScene: "code-build",
      theme: "t-terminal",     // deep navy · electric blue — glass cubes se
      objs: [
        { kind: "code-silicon-chip", count: 1 },
        { kind: "code-keycap-brace", count: 1 },
        { kind: "code-terminal-panel", count: 1 },
        { kind: "code-git-branch", count: 1 },
        { kind: "code-glass-card-stack", count: 1 },
      ],
      sub: "Ra.One x Matrix Code — Micro-matter voxel assembly, live binary streams, dual-layer atmosphere, aur scroll-driven core fly-through.",
    },
    {
      n: "03",
      label: "Attention into <em class='coral-italic'>measurable</em> growth.",
      accent: "measurable",
      layout: "market",
      image: marketImg,
      nativeScene: "market-growth",
      theme: "t-indigo",       // AFTERIMAGE space palette — dark space, electric blue, coral
      objs: [
        { kind: "market-bar-chart", count: 1 },
        { kind: "market-line-graph", count: 1 },
        { kind: "market-avatar-card", count: 1 },
        { kind: "market-heart-reaction", count: 1 },
        { kind: "market-smartphone-chart", count: 1 },
      ],
      sub: "We connect search strategy, paid acquisition, persuasive creative, and sales systems to turn demand into predictable revenue.",
    },
    {
      n: "04",
      label: "We consult",
      accent: "consult",
      layout: "consult",
      image: null,
      theme: "t-forest",       // deep green · gold — glass rings se
      objs: [
        { kind: "consult-clipboard", count: 1 },
        { kind: "consult-fountain-pen", count: 1 },
        { kind: "consult-spectacles", count: 1 },
        { kind: "consult-chess-knight", count: 1 },
        { kind: "consult-magnifying-glass", count: 1 },
      ],
      sub: "Launch end nahi hai. Monitoring, iteration aur support chalti rehti hai.",
    },
  ],
};

export const PRODUCTS = [
  {
    name: "DHANDO",
    id: "BLD-01",
    kicker: "BUSINESS OPERATIONS",
    status: "ONLINE",
    uptime: "99.94",
    blurb:
      "Chhote aur medium vyapaar ke liye inventory, billing aur party ledger — ek hi jagah. Jo register pehle haath se likha jaata tha, wahi ab real-time sync ke saath.",
    points: ["INVENTORY", "GST BILLING", "PARTY LEDGER"],
    stack: ["React", "Node", "Postgres"],
  },
  {
    name: "TAP",
    id: "BLD-02",
    kicker: "PAYMENTS LAYER",
    status: "ONLINE",
    uptime: "99.98",
    blurb:
      "Collect-first payments — QR, links aur reconciliation ek hi flow mein. Merchant ko sirf ek tap chahiye, baaki system sambhaal leta hai.",
    points: ["UPI / QR", "AUTO RECON", "SETTLEMENTS"],
    stack: ["Node", "Redis", "Webhooks"],
  },
  {
    name: "MUNSI",
    id: "BLD-03",
    kicker: "LEDGER ENGINE",
    status: "ONLINE",
    uptime: "99.91",
    blurb:
      "Aapka digital munshi. Entries, khata-bahi aur filing-ready statements — bina accountant ke bhi books saaf rehti hain.",
    points: ["DOUBLE ENTRY", "RECONCILE", "EXPORTS"],
    stack: ["Postgres", "Python", "Pandas"],
  },
  {
    name: "WATER LEVEL",
    id: "BLD-04",
    kicker: "IOT TELEMETRY",
    status: "ONLINE",
    uptime: "99.87",
    blurb:
      "Tank aur borewell ke liye ultrasonic level sensing, live dashboard aur threshold alerts. Motor kab chalana hai — ab andaza nahi, data.",
    points: ["ULTRASONIC", "LIVE FEED", "DRY-RUN ALERT"],
    stack: ["ESP32", "MQTT", "TimescaleDB"],
  },
  {
    name: "ZIMMEDARI",
    id: "BLD-05",
    kicker: "ACCOUNTABILITY",
    status: "BETA",
    uptime: "99.40",
    blurb:
      "Task aur compliance tracking jisme har kaam ka ek naam hota hai. Assign karo, deadline lagao, aur audit trail apne aap ban jaata hai.",
    points: ["OWNERSHIP", "ESCALATION", "AUDIT TRAIL"],
    stack: ["React", "Node", "S3"],
  },
];

/** CORE MODULES — capabilities */
export const CAPABILITIES = [
  {
    code: "MOD.01",
    title: "PRODUCT ENGINEERING",
    body: "Discovery se deployment tak. Web, mobile aur backend — ek team, ek codebase standard.",
    tags: ["React", "Node", "Postgres", "React Native"],
  },
  {
    code: "MOD.02",
    title: "IOT & EMBEDDED",
    body: "Sensor firmware, gateway, ingestion pipeline aur dashboard. Hardware se pixel tak poora stack.",
    tags: ["ESP32", "MQTT", "Time-series", "OTA"],
  },
  {
    code: "MOD.03",
    title: "CLOUD & INFRA",
    body: "CI/CD, observability aur cost-aware infra. Deploy boring hona chahiye — hum usse boring rakhte hain.",
    tags: ["Docker", "CI/CD", "Grafana", "Backups"],
  },
  {
    code: "MOD.04",
    title: "INTERFACE SYSTEMS",
    body: "Design systems jo scale karte hain. Accessible, fast, aur har product mein consistent.",
    tags: ["Design systems", "Motion", "a11y", "Tokens"],
  },
];

/** INFRASTRUCTURE — request ek product tak kaise pahunchti hai */
export const INFRA = [
  { layer: "EDGE", detail: "CDN · TLS termination · WAF", metric: "12ms" },
  { layer: "APPLICATION", detail: "Containerised services · autoscale", metric: "40ms" },
  { layer: "DATA", detail: "Postgres · Timescale · object store", metric: "8ms" },
  { layer: "DEVICE", detail: "ESP32 fleet · MQTT · OTA channel", metric: "2.1k" },
];

/** OPERATIONAL SEQUENCE — process */
export const PROCESS = [
  { step: "DISCOVER", body: "Problem ko field mein jaakar samajhna. Assumptions likhit mein, guesses nahi." },
  { step: "DESIGN", body: "Flows, states aur edge cases pehle. Pixel baad mein." },
  { step: "BUILD", body: "Do-hafte ke cycles, har cycle mein kuch chalta hua deliver." },
  { step: "OPERATE", body: "Launch end nahi hai. Monitoring, iteration aur support chalti rehti hai." },
];

export const STATS = [
  { value: 5, suffix: "", label: "SYSTEMS DEPLOYED" },
  { value: 40, suffix: "+", label: "RELEASES SHIPPED" },
  { value: 99.9, suffix: "%", label: "FLEET UPTIME", decimals: 1 },
  { value: 6, suffix: "Y", label: "OPERATIONAL" },
];
