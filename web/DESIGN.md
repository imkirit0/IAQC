# RDS design direction (current)

**Direction:** professional, brand-led enterprise UI for G-TEC Education. Calm neutral surfaces, G-TEC navy `#004282` as the
primary accent, logo red `#FF0000` reserved for small brand marks (active tab, gauge needle, button hover stroke); red text
deepens to `#D4100B` for contrast. Risk colours keep their meaning: green / amber / red.

- **Type:** IBM Plex Sans throughout (400–700), tabular figures for every score, percentage and date. Headings 600, modest sizes.
- **Shape:** 6 px controls, 10 px cards, quiet one-step elevation in light mode, hairline borders in dark mode.
- **Motion:** page settle, count-up figures, filling score bars, drawn trend lines, spring dialogs, toasts, shared-layout
  tab and answer indicators. All off under reduced motion.
- **Sign-in:** navy brand panel (capped at 820 px, deeper navy `#03305d` in dark mode) carrying the title, the green / amber / red
  risk bands and the three roles; form at 420 px with 46 px controls and demo accounts as avatar rows. Roles and footer hide on phones.
- **Changed (on request):** the "Detector" recorder strip, wide display type and chart-grid textures were removed for a more
  conventional, professional look. The earlier exploration is kept below for reference.

---

# RDS — design direction

## Brief
- **Subject:** RDS, the Risk Detection System — internal audit and quality control of an education franchise's centres.
- **Audience:** the CMD (approves the project, reads the overview), the IAQC Coordinator (runs it daily), Area Coordinators (fill reports on phones at a centre).
- **Job:** win management approval in a demo, then be a dependable daily tool. Mode is *Operate*: scanability first, theatre second.
- **Constraints:** green / yellow / red keep their meaning everywhere. No loader, no WebGL (an internal tool earns craft, not spectacle).
- **Assumptions:** fictional DEMO DATA; checklist criteria are sample policy requirements.

## Concepts considered
| Territory | Concept | Signature | Anchor | Orig | Fit | Feas | Portab. (low = good) |
|---|---|---|---|---|---|---|---|
| Profession's material | **Carbon copy** — audit forms in triplicate, rubber stamps, ledger rules | Submitting a report stamps "RECORDED" and files it into the ledger | Audit paperwork | 3 | 4 | 5 | 3 (any audit firm) |
| Name / etymology | **The detector** — the product is literally a *detection system*; every centre is a signal on a seismograph drum | A live recorder strip: each centre's risk is drawn as a tremor whose amplitude *is* its risk %, critical alerts spike in red ink, the pen keeps sweeping | "Risk Detection System" + the risk % reading + the 70 / 85 thresholds | 5 | 5 | 4 | 1 |
| Formal system | **Thresholds** — the whole grid ruled by the 70 / 85 bands | Layout bands shift as scores cross thresholds | Configurable thresholds | 3 | 3 | 3 | 2 |

**Chosen: The detector.** It is the only one built from the product's own name and its actual data — the trace is not decoration, it is the ranking drawn as a signal.

## Concept card
```
Idea:        Every franchise centre is a signal; RDS is the instrument that records it.
Metaphor:    A seismograph / chart recorder — gridded chart paper, an ink pen, threshold lines, readings.
Signature:   The Detector strip (src/components/Detector.tsx): all centres drawn as one continuous trace,
             amplitude = risk %, red spikes for critical alerts, a pen that sweeps the drum at rest and
             jumps to a centre on hover/focus with a damped overshoot, reading out its value.
Emotion:     Calm precision with a pulse — the first 3 s feel like an instrument already running.
Motion verb: "Register like a needle": fast travel, slight overshoot, damped settle. Never floaty.
Screenshot:  The ranking header — chart grid, a tremoring black trace with two red spikes, the pen
             parked on a centre and its reading beside it.
```

## Art direction
- **Palette (light — chart paper):** ground `#EFF1EC` · sheet `#FBFCF9` · ink `#121416` · muted `#59605C` · line `#D8DDD5` · grid `#E3E7DF` · recording red `#C2311F` (critical spikes, threshold marks only) · curtain `#121416`.
- **Palette (dark — oscilloscope bench):** ground `#0D100F` · sheet `#141817` · ink `#E6EBE5` · muted `#97A09A` · line `#262D2A` · grid `#1A201E` · recording red `#F0705E`.
- Risk semantics unchanged: green `#2F7D46`, amber `#B58600`, red `#C2311F`, critical = recording red, solid.
- **G-TEC brand (from the supplied logo, sampled):** navy `#004282` is the primary accent (buttons, links, avatar, sign-in cover ground);
  logo red `#FF0000` is the pen's ink (detector pen, nav indicator, gauge needle, primary-button hover stroke). Where red carries
  small text it deepens to `#D4100B` (light) / `#FF5E52` (dark) for AA contrast. Logo: `public/brand/gtec-logo.png`; favicon `src/app/icon.png`
  is the mortarboard-and-G emblem on navy.
- **Sign-in cover:** the brand panel — navy ground with a faint chart grid, logo top-left, the recorder writing in white with a red pen.
- **Type:** *Archivo* (Google, variable width 62–125) — expanded heavy for display, normal for UI and body; *IBM Plex Mono* for readings, codes and numbers (they are measurements). Display tracking −0.03em, body 15–16 px / 1.5.
- **Grid & rhythm:** 12 columns, 24 px gutter, content max 1480 px; readings right-aligned to the grid; section rhythm alternates dense tables with one open instrument band per page.
- **Shape:** 2 px radius everywhere (instrument panels, not cards); 1 px hairlines; the chart grid is the only texture.
- **Motion language:** spring stiffness ~420, damping ~22 for "needle" moves (small overshoot); 0.5–0.9 s exponential ease-out for reveals; stagger 30–50 ms. Everything on Motion's frame loop (one clock).
- **Idle state:** the Detector pen sweeps the drum and trembles with the local signal; off under reduced motion (static trace, pen parked on the highest-risk centre).

## Genericness test
A generic model would land on "dashboard with KPI cards and a line chart", or the previous "editorial paper + serif".
Changed: serif editorial → engineered instrument (Archivo expanded + Plex Mono readings); chart → recorder strip whose geometry *is* the ranking; KPI tiles → a readings ledger set in mono; rounded cards → 2 px instrument panels on chart-grid ground.
