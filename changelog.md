# Changelog

## Unreleased

- Add compact conditional overnight readiness with HA-local/DST deadline, reserve shortfall and explicit manual/history/recent/current demand basis.
- Add ephemeral what-if load/capacity/reserve/deadline simulation without changing live configuration; preserve both Battery estimates.
- Add editor-only guided entity checks, sign confirmation and explicit review/save/cancel; preserve direct/YAML configuration.
- Extend model/lifecycle/UI tests and offline development demo, using one simulated 16 kWh battery. No version/tag/release change.

## 0.4.1

- Confirm observed MAIN A028-1727 / HMI 0000-C382 / protocol 0201 identity in README, commissioning guide and read-only profile notes; distinguish identity confirmation from exact-register validation.
- Add firmware-evidence documentation regression test. Preserve existing decoding, units, polarity, freshness and unknown-state logic rather than apply unsupported firmware-specific overrides.

## 0.4.0

- Add read-only estimate bands, load runtime scenarios, guarded opt-in session taper learning, outage Recorder/live timeline, BMS current indicators, solar utilization, MPPT detail, indicative source mix, diagnostics/coverage and three density presets.
- Include reviewed Waveshare/Modbus HTML commissioning guide, read-only YAML and secrets template; correct UART direction control and document firmware/register-role validation gates.
- Align numeric timestamp reporting with native HA updates and require a core-register freshness quorum; avoid falsely aging transition-only binary/status flags.

- Render fresh confirmed grid disconnection in red, with a static red X on the image-safe desktop connector lane; hide the marker for unknown/stale/reconnected states.
- Fix demo sun/moon switching by toggling SVG hidden attributes rather than an HTMLElement-only property.
- Add regressions for marker geometry/state transitions and ensure demo-only selectors are absent from the installed card.
- Document demo-only controls and the configurable disconnect color; retain all runtime, forecast, statistics, transparency and read-only behavior.

## 0.3.0 — source update

- Use integration-independent metadata and neutral identity defaults; retain editable ratings and battery forecast behavior.
- Add installed solar-array nameplate size without altering measured production.
- Distinguish disconnected, unknown and stale grid states; stop grid flow and suppress misleading retained readings during disconnection.
- Add grid-state controls and system customization to the offline demo.
- Add an Off-Grid outage preset and an accessible sun/moon toggle with system-first appearance to the demo.
- Include MIT notices in exported HTML and production JavaScript.
- Rewrite installation/configuration documentation and remove internal planning, log and graph artifacts from the current repository tree.

## 0.2.1

- Balance battery SOC/power and keep target/full estimates visible together.
- Preserve runtime, milestones and confidence in Battery details.
- Add recent-load trend, time-weighted average, peak, coverage and independent retry.
- Separate a reached lower goal from the full projection.

## 0.2.0

- Add illustrated reversible flows, freshness gating and transparent presentation.
- Add editable identity/image, clock/polarity, runtime and modeled charging milestones.
- Add Today Recorder history, Week/Month statistics and accessible inspection.

Source changes do not replace previously published release assets. Offline export and clarified reserve wording were added between 0.2.1 and 0.3.0.
