# PowerFlo

PowerFlo is a read-only, live power-flow card for Home Assistant. The first supported preset targets the Deye `SUN-12K-SG02LP1-EU-AM3` with a paired 32.14 kWh Pylontech Fidus battery bank.

![PowerFlo design mockup](assets/powerflo-mockup.png)

## Current status

PowerFlo is an early implementation. The state engine, reversible flow model, Recorder-history utilities, visual editor, responsive card shell, and unit tests exist. Live Deye commissioning, accessibility browser testing, and a tagged HACS release remain open.

## Safety boundary

PowerFlo reads Home Assistant entities. It does not connect to Modbus, call Home Assistant services, or write inverter settings.

## Features

- Dynamic `Static`, `Charging`, and `Discharging` battery status.
- Configurable battery and grid sign conventions.
- Reversible solar, grid, battery, and load arrows driven by current power state.
- Freshness-gated transform-only flow particles.
- Solar, Grid, Load, and Battery Today histories from Home Assistant Recorder.
- Editable title, inverter identity, ratings, clock format, and safe local raster image upload.
- 12-column Sections compatibility through `getGridOptions()`.
- Dark/light theme variables, narrow-card layout, and reduced-motion behavior.
- Plain JavaScript and JSDoc; no TypeScript toolchain.

## Transparent theme support

The outer card, inverter panel, flow nodes, and Today summaries have transparent backgrounds and no outer shadow. Your dashboard background or wallpaper shows through every panel. Text and borders use Home Assistant's `primary-text-color`, `secondary-text-color`, `divider-color`, and card border/radius variables, including custom themes. Flow colors retain their domain meaning. Uploaded inverter images retain their original background; use a transparent PNG or WebP for an image that blends into the dashboard.

## Required entities

| Mapping | Purpose |
|---|---|
| `freshness` | Boolean entity that is on/fresh while fast Modbus telemetry is current |
| `inverter_status` | Deye register 59 text state |
| `grid_connected` | Deye register 194 boolean state |
| `solar_power` | Aggregate PV power in watts |
| `battery_soc` | Battery state of charge in percent |
| `battery_power` | Signed battery power in watts |
| `grid_power` | Signed grid power in watts |
| `load_power` | Protected-load power in watts |

PV channel values, voltage, temperature, frequency, and Today energy entities are recommended but optional.

## Development

```bash
npm install
npm run verify
```

The build writes `dist/powerflo-card.js` and its source map.

## Development dashboard configuration

Use Home Assistant's dashboard editor or resource API; never edit `.storage` directly.

```yaml
type: custom:powerflo-card
title: Deye Energy
inverter_name: DEYE
inverter_model: SUN-12K-SG02LP1-EU-AM3
inverter_capacity_kw: 12
battery_capacity_kwh: 32.14
clock_format: "12"
battery_positive: discharge
grid_positive: import
entities:
  freshness: binary_sensor.deye_modbus_flow_fresh
  inverter_status: sensor.deye_running_status
  grid_connected: binary_sensor.deye_grid_connected
  solar_power: sensor.deye_pv_power
  battery_soc: sensor.deye_battery_soc
  battery_power: sensor.deye_battery_power
  grid_power: sensor.deye_grid_power
  load_power: sensor.deye_inverter_output_power
```

Entity IDs above illustrate the required shape. Select the actual entities created by the commissioned gateway.

## Repository technology

1. The build system is Rollup 4.
2. The frontend is a standards-based Web Component.
3. The language is modern JavaScript with JSDoc.
4. There is no backend or database.
5. Authentication is inherited from the Home Assistant frontend.
6. There is no payment system.
7. Distribution is designed for HACS and Home Assistant dashboard resources.
8. Verification runs through GitHub Actions.
9. Unit tests use Vitest 5 with Happy DOM.
10. The production card has zero runtime package dependencies.

## License

MIT
