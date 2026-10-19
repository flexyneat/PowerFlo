# PowerFlo

A transparent, read-only Home Assistant card for solar, battery, grid and load power flow. Map your existing entities, configure your system's ratings, and see what is supplying your loads now.

![PowerFlo v0.4.1: charging battery estimates, protected-load trend and energy history](assets/current-design.png)

*Captured from the v0.4.1 offline demo; readings are simulated and demo controls are hidden. PowerFlo does not discover hardware, connect directly to an inverter or change inverter settings.*

## Features

- Reversible power-flow arrows, dynamic battery status and freshness-gated motion.
- Disconnected-grid presentation separate from unknown connection data and stale telemetry.
- Side-by-side battery SOC/power, with target and full estimates always visible. Runtime, milestones, confidence and assumptions remain in Battery details.
- Recent 15-minute protected-load trend, time-weighted average, observed peak and coverage labels.
- Today/Week/Month energy history with pointer, touch and keyboard observation inspection.
- Editable title, inverter name/model/image, inverter rating, battery capacity and solar-array nameplate size.
- Transparent theme-native surfaces, responsive layout, 12/24-hour clock and reduced-motion support.
- Single-file offline demo with simulated controls and system customization.
- System insights: estimate bands, conditional load runtimes, opt-in observed taper, BMS limits, solar/MPPT detail, power/energy proportions, diagnostics, outage history and density presets.
- Overnight readiness with local morning deadline, planning reserve, conditional morning SOC and explicit demand-data provenance.
- On-demand what-if load/capacity simulation that never changes installed settings.
- Editor-only guided entity mapping with role/sign confirmation and explicit review/save/cancel.
- Public Waveshare/Modbus commissioning guide and compile-verified read-only ESPHome profile, with live validation gates clearly separated.

Production source is JavaScript with no runtime package dependencies. The card reads through Home Assistant's existing authenticated frontend connection. It does not call services, write inverter settings or access Modbus directly.

## Compatibility is an entity contract

PowerFlo began with a Deye profile, but its display is integration-independent. Other inverter models can use it when their integrations expose the measurements below with the expected units and polarity. This is not a claim that every model or firmware has been tested.

Use aggregate solar, grid and protected-load readings. There are three optional PV-channel slots; the card is not a per-phase diagnostic display. Device protocols and register maps belong to your upstream integration.

**Set your real ratings before using estimates.** The retained 12 kW and 32.14 kWh defaults are example values for backward compatibility, not automatic detection. Solar size is a nameplate label, not measured generation or a forecast multiplier.

## Installation

Manual installation is supported. HACS metadata exists, but automated HACS distribution/installation has not been validated.

### 1. Get the files

Use both installation files from a [published release](https://github.com/flexyneat/PowerFlo/releases), when available for the version you want, or build the source checkout with Node.js 22+:

```bash
npm ci
npm run verify
```

The current source version is **0.5.0**. Build output:

```text
dist/powerflo-card.js
dist/inverter-reference.png
dist/PowerFlo-demo-v0.5.0.html
```

Install the JavaScript and PNG together. The HTML is a demo, not an HA resource; the source map is optional. Source changes do not replace previously published release assets.

### 2. Copy into Home Assistant

Create `www/powerflo/` in your HA configuration directory:

```text
<config>/www/powerflo/powerflo-card.js
<config>/www/powerflo/inverter-reference.png
```

HA serves `www/` files under `/local/`. If you have just created `www/` for the first time, restart HA so it recognises the directory. See the [official custom-card documentation](https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/).

### 3. Register the module

Enable Advanced mode in your user profile. Open **Settings → Dashboards**, then **Resources** in the three-dot menu. Add `/local/powerflo/powerflo-card.js?v=0.5.0` as a **JavaScript module**. For YAML-managed resources:

```yaml
lovelace:
  resource_mode: yaml
  resources:
    - url: /local/powerflo/powerflo-card.js?v=0.5.0
      type: module
```

Use the resource-management method matching your dashboard setup; avoid duplicate registrations. See [resource registration](https://developers.home-assistant.io/docs/frontend/custom-ui/registering-resources/) and [dashboard resource modes](https://www.home-assistant.io/dashboards/dashboards/).

### 4. Add your card

Use the visual editor or a manual card. Replace every example entity ID with one from your installation:

```yaml
type: custom:powerflo-card
title: Home energy
inverter_name: My inverter
inverter_model: My model
inverter_capacity_kw: 8
battery_capacity_kwh: 20
solar_capacity_kw: 10.5
battery_positive: discharge
grid_positive: import
battery_reserve_soc: 20
battery_charge_target_soc: 95
entities:
  freshness: binary_sensor.inverter_telemetry_fresh
  inverter_status: sensor.inverter_status
  grid_connected: binary_sensor.grid_connected
  solar_power: sensor.solar_power
  battery_soc: sensor.battery_soc
  battery_power: sensor.battery_power
  grid_power: sensor.grid_power
  load_power: sensor.protected_load_power
```

## Entities and units

| Required key | Expected value |
| --- | --- |
| `freshness` | A trustworthy boolean for current telemetry, not an always-on helper |
| `inverter_status` | Readable operating-status text |
| `grid_connected` | Boolean connection state; do not infer it from zero import |
| `solar_power` | Aggregate generation, W |
| `battery_soc` | SOC, % |
| `battery_power` | Signed battery-side power, W |
| `grid_power` | Signed grid power, W |
| `load_power` | Protected-load demand, W |

Boolean aliases include `on/off`, `true/false`, `connected/disconnected`, `online/offline`, `1/0` and `yes/no`. Unknown data is not false; blank numeric data is not zero. The card depends on your integration's freshness signal and cannot independently prove hardware connectivity.

With `battery_positive: discharge`, positive watts mean discharge and negative watts mean charge. With `grid_positive: import`, positive watts mean import and negative watts mean export. Reverse these options when your source uses the opposite convention.

Optional mappings go inside the same `entities` object:

| Key | Unit / purpose |
| --- | --- |
| `pv1_power`, `pv2_power`, `pv3_power` | W, PV-channel power |
| `battery_voltage`, `battery_temperature` | V and °C |
| `grid_voltage`, `grid_frequency` | V and Hz |
| `solar_today`, `grid_today`, `load_today`, `battery_today` | kWh, daily energy counters |
| `solar_forecast_power` | W, optional average future solar supply—not a daily kWh forecast |

Choose counters deliberately: import is not net grid energy, and battery discharge is not charging energy. Summary labels do not change the meaning of your source counters.

## System customization

The native editor exposes the fields below, image upload and entity/statistic mappings. Text is rendered as text, not HTML.

| Option | Default | Purpose |
| --- | --- | --- |
| `title` | `PowerFlo` | Title, up to 60 characters |
| `inverter_name` | `Inverter` | Name/brand, up to 40 characters |
| `inverter_model` | Empty | Model, up to 80 characters; hidden when empty |
| `inverter_capacity_kw` | `12` | Rated AC power label, 0.1–1,000 kW; set your rating |
| `battery_capacity_kwh` | `32.14` | Effective energy for estimates, 0.1–10,000 kWh; update after expansion |
| `solar_capacity_kw` | `0` | DC array nameplate in kWp, 0–10,000; zero hides it |
| `inverter_image` | Empty | Default illustration or supported local/raster data URL |
| `clock_format` | `"12"` | AM/PM or `"24"`; HA timezone |
| `battery_positive` / `grid_positive` | `discharge` / `import` | Positive-power meanings |
| `flow_threshold_w` / `flow_release_w` | `40` / `20` | Activation and battery/grid release thresholds; release cannot exceed activation |
| `battery_reserve_soc` | `20` | Runtime reserve, 0–100%; not an inverter command |
| `battery_charge_target_soc` | `100` | Charging estimate goal, 1–100% |
| `runtime_window_minutes` | `5` | Averaging window, 1–60 minutes |
| `runtime_max_sample_age_seconds` | `60` | Battery sample age/gap limit, 5–300 seconds |
| `charge_taper_start_soc` | `90` | Assumed taper start, 50–99% |
| `charge_taper_floor_ratio` | `0.2` | Assumed power ratio at full, 0.05–1 |
| `solar_projection_hours` | `4` | Supply horizon, 0–24 hours; capped at sunset when available |

Upload PNG/JPEG/WebP up to 2 MB and 4096 × 4096 pixels. The image is embedded in card configuration. Alternatively use a raster image under `www/` with a `/local/` path. External URLs, active URLs and SVG uploads are rejected. Use transparent PNG/WebP if you want the image itself to blend into the dashboard.

Panels are transparent and shadow-free. Text/borders inherit HA theme variables. Themes can override `--powerflo-solar-color`, `--powerflo-grid-color`, `--powerflo-battery-color`, `--powerflo-load-color` and `--powerflo-disconnected-color`; check contrast against your background.

## Grid states

| Condition | Display |
| --- | --- |
| Fresh connection true and numeric power | Importing, exporting or static, with measured power |
| Fresh connection false | Red **Disconnected** and a red X on the desktop grid connector; no grid flow, and retained measurements are not shown as live |
| Fresh connection unknown | **Unavailable**; connection unknown and flow paused |
| Stale/unavailable telemetry | **Stale/Unavailable**; last-reported connection labelled and flow paused |

A disconnected port is not automatically proof of a utility outage. The card reports your mapped connection entity. Zero power on a connected grid stays Static, not Disconnected. The X is hidden for unknown or stale telemetry; compact layouts omit connector lines but keep the textual disconnect status.

## Battery forecasts

Both target/full estimates remain visible. A configured goal below 100% is used for the target column; with a 100% goal, the intermediate target is 95%. Full independently projects to 100%. Reaching 95% does not mark full as reached.

Runtime is effective capacity × `(SOC − reserve) / 100`, divided by smoothed battery-side discharge power. Charging uses measured net charge, solar-supply assumptions and configurable upper-SOC taper. Net charge already includes solar; solar is not added twice.

While charging or idle, runtime says Not discharging and labels the discharge reserve separately. During discharge it shows duration until that reserve. Battery details retains 50/75/95 milestones, the configured-goal forecast, runtime, confidence and assumptions.

Confidence describes observation quality, not a calibrated probability of finishing on time. Missing/stale samples pause estimates. Taper and future solar are assumptions, not battery specifications. Keep capacity and assumptions accurate; none of these settings change actual inverter charging behavior.

## History and recent demand

Today uses daily-energy Recorder samples from HA local midnight plus fresh endpoints. Week covers seven local calendar days including today; Month starts at local midnight on the first of this month. Week/Month use completed hourly long-term energy statistics, not guessed raw-power totals.

If statistics IDs differ from your daily-counter entities, configure them explicitly:

```yaml
statistics:
  solar: sensor.solar_energy_total
  grid: sensor.grid_import_energy_total
  load: sensor.load_energy_total
  battery: sensor.battery_discharge_energy_total
```

Statistics need energy units and sum support. Missing hours/counters are labelled partial; statistics paths split at gaps. The unfinished hour is not extrapolated. Inspect observations with pointer/touch or the keyboard time slider; Escape clears inspection.

Recent demand is a separate trailing 15-minute window of `load_power`. Average is time-weighted over covered intervals; peak is the maximum trustworthy observation. Recorder backfills one entity at most once per minute per card. A reading holds to the next state but for no more than 60 seconds. Missing time is not zero demand or an indefinite hold. Partial averages show coverage; failures retain observed samples and expose a retry independent of energy-history retry.

## Offline demo

```bash
npm run build:demo
```

Share `dist/PowerFlo-demo-v0.5.0.html` alone. JavaScript, styles, the PNG and MIT notice are embedded. Open it in a browser without a server, HA, Node or internet. Email previews may not run JavaScript; download and open the file instead.

Try battery modes, connected/disconnected/unknown/stale grid states, periods and chart inspection. The **Off-Grid** preset simulates a fresh outage: grid flow and solar production stop, and the battery supplies the protected load. Choosing another battery mode restores the connected-grid example; choosing another grid state exits the outage preset.

Appearance follows the system light/dark preference initially. The sun/moon button switches between light and dark; after a manual selection, system changes no longer override it. Reload to return to automatic appearance. Customize system exposes the native editor for identity, ratings, battery/solar size, image and behavior. Preview settings stay in memory: they are not saved into the HTML or sent to hardware. Use raster upload rather than an HA-only image URL when offline.

The fixture is labelled simulated and has no live HA connection or credentials. Its Content Security Policy blocks external connections/assets. Review any local fixture edits before sharing. The HTML is not an HA installation resource.

Battery/Grid scenario dropdowns and the sun/moon button belong only to the demo, outside the card. They are not rendered on the installed Home Assistant card, which follows HA's theme and mapped live entities. The normal card editor's configuration fields remain available when editing a dashboard.

## Update and troubleshoot

Replace both installation files, change the module's cache key to the installed version, and reload the frontend/companion app cache. Custom element missing? Check the resource URL and browser console. Image missing? Keep the PNG beside the JS or check your custom path.

Reversed arrows? Verify polarity against source readings. Grid unavailable? Check connection mapping rather than substituting zero. Estimates not warming up? Check freshness, battery timestamps and at least 30 seconds of continuous samples. Empty graphs? Check Recorder inclusion, units and sum-capable statistics. Never post tokens, passwords or private readings in an issue.

To uninstall, remove the card and resource, then its two installed files. No inverter configuration needs undoing.

## Development and limitations

`npm run verify` runs ESLint, Vitest coverage, Rollup and the offline exporter. Source is in `src/`, tests in `test/`, the fixture in `demo/`, and export tooling in `scripts/`. Build output is Git-ignored. No TypeScript or runtime frontend library is required.

Automated/simulated checks are not hardware commissioning. Validate your live HA instance, entity mappings, statistics and battery taper assumptions. The card does not increase upstream polling or make a stale integration live.

## License and artwork

MIT; see [LICENSE](LICENSE). Copyright © 2026 PowerFlo contributors. Keep the copyright and permission notice when redistributing software; the generated demo and production JS include it.

The transparent PNG is an AI-generated illustration, not an official manufacturer photograph, enclosure specification or certification. Model/name labels are user configuration; PowerFlo claims no manufacturer affiliation.

## System insights (0.4.0)

Open **System insights** for advanced detail; both target/full estimates stay visible in the battery card. Set `density` to `compact`, `standard` (default), or `expanded` in YAML/editor. Compact reduces spacing, not essential readings; expanded opens insights initially.

| Feature | Behavior and boundary |
|---|---|
| Estimate bands | Inverse-rate scenarios using observed rate variation (10–75% spread); not calibrated probability intervals. Non-ready states have no numeric band. |
| Load runtime scenarios | Capacity above reserve × `runtime_load_efficiency` ÷ current/average/peak AC load. Efficiency defaults to 0.9, configurable 0.5–1. No future solar/load growth; missing/zero load stays unavailable. |
| Observed taper | Session-only, bounded low/high-SOC sample fitting with stable observed supply. `use_learned_taper: false` is default; true uses qualified learning or configured fallback. Not BMS characterization; no cross-reload persistence. |
| BMS current indicators | Optional `battery_current`, `bms_charge_current_limit`, `bms_discharge_current_limit` in A. Near-ceiling label at ≥95% of relevant reported limit. No current limits changed. |
| Solar utilization | Instantaneous fresh W / installed kWp nameplate. Not efficiency; can exceed 100%. |
| MPPT detail | Existing three power slots plus optional `pv1_voltage/current` through `pv3_voltage/current` in V/A. Unmapped/stale channels remain unavailable. |
| Supply / energy mix | Instantaneous PV/import/discharge proportions. Set `energy_sources_verified: true` only after confirming counter roles to also show Today/Week/Month gross-energy proportions. Storage cycling can double-count energy; neither is routed-load attribution. Inspect partial statistics/coverage. |
| Data-quality diagnostics | Required mappings, numeric values, units, live numeric timestamps and history coverage. Transition-only binary/status entities are not falsely aged by last change. Polarity still requires physical validation. |
| Outage timeline | Trailing 24-hour Recorder reads of connection AND freshness, at most once/minute, plus live-session observations. Unknown intervals are partial; missing records do not prove no outages. |
| Density presets | Accessible native disclosure with responsive spacing. Installed card has no demo scenario dropdowns or theme toggle. |

Learning needs three distinct charging samples below the configured taper start and three at ≥95% SOC. Duplicate timestamps/unstable supply (>10% source change) are excluded; telemetry gaps/backward SOC reset the session. Qualified rate-floor fitting is clamped 0.05–1 and affects estimates only when opted in. Inferences may reflect source/BMS constraints, not battery chemistry.

## Overnight readiness, simulator and guided setup (0.5.0)

These additions preserve both Battery estimates, existing features, transparent surfaces and JavaScript-only read-only behavior. No new Modbus registers are required. Configure your **actual installed total kWh**; the demo illustrates one 16 kWh battery. A hypothetical expansion never changes installed capacity. Per-battery-pack visibility is not included.

```yaml
readiness_enabled: true
readiness_deadline: "06:00"       # Home Assistant local time, not the browser's zone
readiness_average_w: null         # blank/null uses observations; 0 means a real zero-load assumption
readiness_min_coverage: 0.8       # accepted historical coverage, range 0.5–1
battery_capacity_kwh: 16         # set your actual installed total
battery_reserve_soc: 20          # reused planning reserve, not an equipment command
runtime_load_efficiency: 0.9     # effective usable-energy factor including losses/overhead once
```

### Overnight readiness

The compact row below the flow diagram estimates supply until the morning deadline **if grid supply fails now** (or remains off), with **no future solar or grid charging credited**. It is energy planning, not a backup guarantee, shutdown setting or compressor-surge/BMS power assessment. Open Readiness assumptions for provenance and limitations. Fresh SOC in % and fresh telemetry are required; missing/invalid values remain unavailable, not zero.

Demand precedence: explicit manual watts; otherwise a qualified three-day matching-local-time profile; otherwise a sufficiently covered recent 15-minute average; otherwise fresh instantaneous demand. Fallbacks are labelled and are not presented as overnight historical profiles. Each required half-hour historical bucket needs configured coverage and observations on at least two local dates. Unknown values and gaps beyond 60 seconds remain uncovered. Slow-reporting sensors may therefore use fallback. Recorder must include the mapped protected-load sensor; forced numeric updates can improve coverage but increase storage.

One filtered protected-load history read covers three days, at most hourly while visible; manual mode skips it. User retries are paced at least one minute apart. Configuration changes/detachment invalidate late responses. Missing/invalid HA time zones make estimates unavailable. The deadline uses HA local calendar and real elapsed time through midnight/DST. A passed deadline moves to the next local day; a nonexistent DST clock uses the first valid minute after it, and repeated clocks use the first occurrence on the selected day.

Usable AC energy above reserve is `capacity_kWh × max(0, SOC − reserve_SOC) / 100 × effective_factor`; demand is `average_AC_watts × hours / 1000`. Morning SOC is `SOC − 100 × demand_kWh / (capacity_kWh × effective_factor)`. Displayed SOC clamps to 0–100 but reserve shortfall is separately retained. Do not subtract standby loss twice when already included in the factor. Capacity aging and future demand remain assumptions.

Illustration only: one 16 kWh battery, 95% SOC, 20% reserve, assumed 0.9 factor and eight hours at 1.20 kW -> 10.8 kWh above reserve, 9.6 kWh demand and about 28% morning SOC. This is not measured battery performance.

### What-if simulator

Open **Explore scenario** for extra average watts, hypothetical total capacity, reserve and deadline. Compare baseline/scenario morning SOC, time to reserve and reserve shortfall. The baseline follows live telemetry; both results use the same scenario deadline. Hypothetical expanded storage starts at current SOC. The example above plus 100 W average gives about 23%; hypothetical 32 kWh gives about 59%.

Inputs are ephemeral, not persisted or passed to equipment or saved configuration. Reset restores scenario defaults. Blank/invalid inputs produce an error instead of a misleading result. All current readings and both Battery estimates remain accessible. Average extra watts are not compressor running/startup watts; representative measured kWh/day is preferable for appliances.

### Guided entity setup

In the visual editor, expand **Guided entity setup**: select candidates, check representations/physical roles and power signs, then explicitly save reviewed mappings. This emits HA's normal `config-changed` display event; the dashboard's own Save action still applies. Cancel discards the isolated draft. Existing direct fields/YAML, optional mappings, identity, image and ratings remain supported. No equipment settings are changed.

Candidates come from existing HA entities, never physical device discovery, and are not auto-applied. Required power is W, SOC is %, and connection/freshness use explicit boolean binary sensors. Convert upstream if needed; no silent scaling. Duplicate roles, incompatible units, invalid values and unavailable entities are flagged. Save requires independent role and sign confirmation; value/unit compatibility is not commissioning proof. Zero watts never proves grid disconnection. Do not interrupt live wiring to verify roles. Optional data can stay unmapped. Neither the guide nor demo scenario dropdowns appear on the everyday installed card.

## Waveshare / Modbus commissioning

[Open the public HTML commissioning guide](waveshare-commissioning-guide.html), with [read-only ESPHome YAML](waveshare-readonly.yaml) and [secrets template](secrets.example.yaml). Download and open the HTML locally; it has no external assets and includes wiring/data-path diagrams, register candidates, security settings, acceptance gates and rollback.

The **Waveshare ESP32-S3-RS485-CAN** is a programmable Wi-Fi/ESPHome gateway, not an Ethernet Modbus gateway. Official board documentation supports TX GPIO17, RX GPIO18 and UART `flow_control_pin: GPIO21`. The gateway uses RS485 for inverter telemetry; battery CAN remains separate. Compatibility with PowerFlo is via documented HA entities, not a device driver inside the card.

**Firmware identity confirmed; register semantics awaiting live validation.** The supplied version-information screenshot confirms MAIN `A028-1727`, HMI `0000-C382` and protocol `0201` for the user's SUN-12K-SG02LP1-EU-AM3. LCD type is `8102`, English version `1001`, and the reported lithium-battery version is `00000000`; that last field does not prove absent BMS communication or identify battery firmware. These are observed identity fields, not Modbus register addresses or transport settings. Protocol `0201` does not establish baud rate, slave address, register layout or scale. Firmware is no longer missing information.

The supplied register profile remains provisional for the SG02LP1 family: no authoritative map tied to this exact model/MAIN/HMI/protocol combination was located during the 2026-10-13 review. A matching MAIN version alone is insufficient, particularly across AM3/AM3-P or single-/three-phase models. Do not invent operating-status, grid-relay or BMS-limit registers. Supply independently validated status/connection entities. Register 192 is a load-frequency candidate, not confirmed grid frequency; 171 is channel-specific CT telemetry. Battery current scaling and protected-load channel role need display/read-back checks. YAML validation, firmware compilation and live hardware commissioning are distinct gates; see release notes for actual evidence.

PowerFlo therefore keeps its existing integration-independent logic: no firmware-string-based scale correction, automatic register selection, Normal/on-grid inference or BMS fallback is introduced. Before accepting this profile, compare raw registers and decoded readings with timestamp-matched display readings in static, charging and discharging conditions; validate grid import/export and protected-load roles where safely available. Keep unverified optional fields unmapped. After an inverter firmware update, repeat these checks. An exact manufacturer register sheet or those live read-backs are the next evidence needed, not another firmware screenshot.

The gateway profile sets `force_update: true` on numeric measurement sensors so unchanged polled values still update HA/frontend timestamps. Its Modbus freshness binary requires recent PV1/2/3, SOC, battery-power, grid-power and load-candidate responses (90-second expiry), not merely a successful PV read. Last-known readings remain visible as stale diagnostics; this heartbeat proves communications coverage, not correct channel semantics. Configure Recorder retention deliberately because forced numeric reports increase measurement rows. Daily energy counters are not forced like instantaneous measurements.

Validation evidence for 0.4.0: YAML schema validation and full firmware compilation succeeded with ESPHome 2026.9.1 / ESP-IDF 5.5.5 for ESP32-S3, using isolated validation-only dummy credentials. No device was flashed; compiled dummy firmware is deliberately not distributed. Generate your own secrets and compile your private configuration before deployment. Board transport/configuration alignment is confirmed; exact-firmware register semantics and physical operation remain commissioning gates.
