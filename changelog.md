# Changelog

## 0.2.0 — 2026-10-13

- Published v0.2.0 to the user-selected private flexyneat/PowerFlo repository with verified JavaScript/image release assets; updated installation documentation. The release tag remains on the verified version-bump commit; publication records are a subsequent documentation commit.

- Bump package and lockfile versions from 0.1.0 to 0.2.0 for the accumulated feature and design refinements below.
- Prepare standalone JavaScript and inverter-image release assets, installation instructions and commissioning limitations in RELEASE-NOTES.md.
- Reverify 84 tests, lint, measured core coverage and production build. GitHub publication awaits repository visibility selection; no remote existed at preparation time.

## Unreleased

- Implement all six approved refinements: typography, unified icons, aligned composition, runtime/milestone rail, actual-observation chart inspection and restrained motion.
- Split statistics paths across missing intervals; preserve flow phase on rate changes; cancel stale text animations; support first-touch inspection and sorted/deduplicated SOC goals.
- Verify 84 tests, lint, coverage and build, transparent light/dark and responsive fixtures; document the approved 4× CPU/Fast 4G local repeat-load trace (181 ms LCP, 0.00 CLS; INP unavailable).

- Preserve the user-selected rendering as a fixed dated reference and document visual constraints and proposed aesthetic refinements without changing card behavior.

- Replace square routes and moving dots with smooth rounded connectors and tangent-oriented directional chevrons.
- Align bundled-art endpoints to measured visible alpha bounds while retaining conservative bounds for uploaded images.
- Remove duplicated header/forecast framing; give forecast text full-width rows and larger top-corner state illustrations, with full-width narrow-layout estimates.

- Keep connector approaches and arrowheads outside the full inverter-image rectangle, including custom uploaded art.
- Add state-aware battery/status illustrations beside runtime, 50%, 75%, 95%, and full/target estimates; retain icon-free energy summaries.

- Rebuild the visual hierarchy to follow the supplied reference: large detailed icons/readings, generated transparent inverter illustration, editable overlay labels, clearer flow routes, and a separate milestone strip.
- Add data-quality confidence based on observed duration, count, age, and variability; cap assumed future solar/taper projections at Moderate.
- Project 50%, 75%, 95%, and full/configured target using measured net charge, modeled solar share, a sunset/horizon cap, optional solar-power forecast, and configurable assumed high-SOC taper.
- Replace Week/Month raw daily-max reconstruction with validated, read-only HA hourly long-term energy changes in kWh.
- Add shared pointer/touch/native keyboard-slider chart inspection showing actual observation timestamps and no fabricated interpolation.
- Ship the local inverter illustration alongside the JavaScript bundle and document provenance and two-file installation.

- Implement net-charge Time-to-Full/Target using an independent time-weighted window and configurable charge target SOC.
- Refine the transparent dashboard with battery SOC ring, two forecast columns, stronger hierarchy, and responsive panel-edge flow connectors.
- Add Today, seven-local-day Week, and calendar-month-to-date Month views for all four energy summaries, with recorded cumulative totals and partial coverage disclosure.
- Add fixed graph axes, bounded period cache, stale-response guards, history loading/error/retry states, and protection against retained pre-midnight counter values.
- Add a simulated preview with theme/charge-state controls and save ten refinement ideas in ROADMAP.md.

- Add a time-weighted recent-discharge runtime estimate in the battery panel, configurable reserve SOC/window/sample age, and explicit warmup/charging/static/stale/reserve states.
- Document time-to-full constant-rate and SOC-band taper formulas; learned future taper remains unimplemented.

- Document manual installation, resource registration, complete entity mappings, configuration defaults, image handling, history, updates, troubleshooting, and current HACS/layout limitations.

- Make the outer card and every display panel transparent, remove the outer shadow, and inherit nested text and borders from Home Assistant themes.

- Establish PowerFlo as a read-only Home Assistant custom card in plain JavaScript.
- Add dynamic battery status and reversible grid/battery flow directions with hysteresis.
- Add freshness-gated transform-only particles and visibility-aware pausing.
- Add Solar, Grid, Load, and Battery Today summaries without icons.
- Add local-midnight Recorder history utilities and inline SVG sparklines.
- Extend Recorder series with current entity values so the Today lines remain live between history loads.
- Add editable display identity, polarity conventions, clock format, and safe raster image upload.
- Add Home Assistant Sections sizing, responsive composition, theme tokens, and reduced-motion behavior.
- Add Vitest unit coverage, ESLint, Rollup, HACS metadata, and GitHub verification workflow.
- Verify bundled browser behavior for charging/discharging and import/export direction changes.
