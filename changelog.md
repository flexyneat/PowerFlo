# Changelog

## Unreleased

- Add a time-weighted recent-discharge runtime estimate in the battery panel, configurable reserve SOC/window/sample age, and explicit warmup/charging/static/stale/reserve states.
- Document time-to-full constant-rate and SOC-band taper formulas; charging forecasts are not implemented yet.

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
