/**
 * THE REEL — what Buildanta actually does, in the words a customer uses.
 *
 * One plate per service. `word` is the hero (what they came looking for),
 * `line` is the promise, `tag` is scope — deliberately NOT an invented
 * performance number. The old reel carried "+420% organic traffic" style
 * claims inherited from the previous team; those are unverified, so new
 * plates state capability instead of results until Yash confirms real figures.
 *
 * `sheet` is what the click-through teaches: plain-language "what it is",
 * three concrete deliverables, and who it is for.
 *
 * `art` points at /assets/reel/<file>. The current files are the Codex plates
 * from the marketing round, mapped by feel; the replacement art brief lives in
 * docs/codex-reel-prompts-v2.md.
  *
 * ── CMS ──
 * The plates now come from site_content, built into content/site.json by
 * buildanta-cms. The array below stays as the FALLBACK and is still the thing
 * to read to understand the shape — a build that has never run, or a checkout
 * without the generated file, renders exactly what it always did rather than an
 * empty reel. Edit the copy in the admin; edit the fallback only when adding a
 * field.
 */
import siteContent from '../../content/site.json'

const FALLBACK = [
  {
    id: "seo",
    word: "SEO",
    line: "We make you the answer<br>Google trusts.",
    tag: "TECHNICAL · CONTENT · AUTHORITY",
    art: "01-seo.jpg",
    what: "Search engine optimisation — the work that makes your business show up when someone types what you sell into Google, without paying for the click.",
    gets: ["Technical fixes so Google can read your site", "Pages written around what buyers actually search", "Authority built through links and listings"],
    who: "Businesses whose customers search before they buy.",
  },
  {
    id: "aeo",
    word: "AEO",
    line: "We make you the answer<br>AI assistants give.",
    tag: "CHATGPT · GEMINI · PERPLEXITY",
    art: "09-reach.jpg",
    what: "Answer engine optimisation — being the business ChatGPT, Gemini and Perplexity name when someone asks them for a recommendation. Search is moving here, and almost nobody is optimised for it yet.",
    gets: ["Your facts structured so AI models can quote them", "Presence on the sources those models read", "Monthly checks on what the assistants actually say about you"],
    who: "Anyone who wants to be found in the next five years, not the last five.",
  },
  {
    id: "ads",
    word: "ADS",
    line: "We buy attention that<br>pays for itself.",
    tag: "GOOGLE · META · CREATIVE",
    art: "03-paid.jpg",
    what: "Paid advertising management — running your Google and Meta campaigns so the money spent comes back as customers, and you can see exactly how.",
    gets: ["Campaigns built, launched and tuned weekly", "Ad creative written and designed", "One report that shows spend against results"],
    who: "Businesses that need customers this month, not next quarter.",
  },
  {
    id: "social",
    word: "SOCIAL",
    line: "We keep you in the feed,<br>not the archive.",
    tag: "CALENDAR · CREATIVE · COMMUNITY",
    art: "07-momentum.jpg",
    what: "Social media management — the posting, designing and replying that keeps your brand alive on Instagram, LinkedIn and Facebook without you touching it.",
    gets: ["A month of posts planned and designed", "Publishing handled across every platform", "Comments and DMs answered in your voice"],
    who: "Brands whose customers scroll before they call.",
  },
  {
    id: "content",
    word: "CONTENT",
    line: "We publish what your<br>buyers are searching for.",
    tag: "STRATEGY · WRITING · VIDEO",
    art: "05-creative.jpg",
    what: "Content marketing — articles, videos and pages that answer your customers' real questions, so you earn the trust before the sales call.",
    gets: ["A topic plan built from real search demand", "Written and filmed content, produced monthly", "Everything optimised for search and AI answers"],
    who: "Businesses selling something people research first.",
  },
  {
    id: "website",
    word: "WEBSITE",
    line: "We build sites that<br>load fast and sell.",
    tag: "DESIGN · BUILD · CARE",
    art: "10-ads.jpg",
    what: "Website design and development — a site that looks like your business at its best, opens instantly on a cheap phone, and turns visitors into enquiries.",
    gets: ["Design and build, end to end", "Speed, security and mobile handled properly", "Ongoing care so it never goes stale"],
    who: "Anyone whose website is older than their ambitions.",
  },
  {
    id: "software",
    word: "SOFTWARE",
    line: "We build the systems<br>your business runs on.",
    tag: "WEB · MOBILE · BACKEND",
    art: "08-growth.jpg",
    what: "Custom software — the tools your business needs but cannot buy off the shelf: billing, inventory, field teams, dashboards. Built around how you already work.",
    gets: ["Web and mobile apps built for your process", "The backend, database and hosting handled", "Support and iteration after launch"],
    who: "Businesses outgrowing spreadsheets and WhatsApp groups.",
  },
  {
    id: "crm",
    word: "CRM",
    line: "We put every customer<br>in one place.",
    tag: "PIPELINE · FOLLOW-UP · REPORTS",
    art: "06-lifecycle.jpg",
    what: "CRM development — one system holding every lead, customer and conversation, so nothing is forgotten and everyone on your team knows where a deal stands.",
    gets: ["A pipeline that matches how you actually sell", "Automatic follow-ups and reminders", "Reports you will genuinely read"],
    who: "Teams losing deals in the gaps between people.",
  },
  {
    id: "iot",
    word: "IoT",
    line: "We put your machines<br>online.",
    tag: "SENSORS · GATEWAY · DASHBOARD",
    art: "04-sales.jpg",
    what: "Hardware and IoT — sensors on real equipment, sending real readings to a dashboard you can open from anywhere. Water tanks, meters, machines, vehicles.",
    gets: ["Sensor hardware chosen, built and installed", "A gateway and data pipeline that survives bad networks", "Live dashboards and threshold alerts"],
    who: "Anyone still checking a machine by walking up to it.",
  },
];

// Services from the CMS, in their authored order. Anything missing falls back.
//
// Merged per-plate rather than all-or-nothing: a service the CMS has not been
// given yet keeps its hardcoded copy instead of vanishing from the reel, which
// is the failure that would be noticed last and hurt most.
function fromCms() {
  const rows = Object.entries(siteContent || {})
    .filter(([k]) => k.startsWith('service.'))
    .map(([, v]) => v)
    .filter((v) => v && v.id)
  if (!rows.length) return null
  rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const byId = Object.fromEntries(FALLBACK.map((s) => [s.id, s]))
  return rows.map((r) => ({ ...(byId[r.id] || {}), ...r }))
}

export const SERVICES = fromCms() || FALLBACK
