# Changelog

## Unreleased

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
