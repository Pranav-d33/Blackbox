# Blackbox Design System · V2 (Apple Colour Scheme)

> **Proof that reads at a glance.** One visual language for the Launch Showroom, the Operator Console and the Public Verifier: calm Apple-system surfaces, big wide headers you can read from across the booth, and controls where your hand already is.

This folder is the **single source of truth** for how Blackbox looks and moves. It replicates the structure of the CHARAK V2 Design System (4 principles, 4×10-step colour ramps, dual light/dark schemes, Anek variable-width typography, 26px tonal cards, 999px pills, and quick-out/soft-landing motion) with the colour palette swapped to **Apple's keynote & HIG system colours**.

---

## 1. Where things live

| Path | What it is |
|---|---|
| `design-system/tokens.json` | Every raw value: 4×10-step Apple ramps, `showroom` (light) + `console` (dark) schemes, 6 status pairs, Anek type scale, radii, sizes, spacing, motion |
| `design-system/README.md` | This specification document |
| `opendesign/design-systems/blackbox/tokens/colors_and_type.css` | CSS variables for HTML mockups and the live design board |
| `opendesign/design-systems/blackbox/SKILL.md` | Portable OpenDesign skill brief |
| `opendesign/mockups/blackbox-design-system/index.html` | Interactive 8-board visual specification (01 Identity, 02 Colour, 03 Typography, 04 Components, 05 Motion, plus annotated live screen boards) |
| `core/web/vendor/fonts/` | Self-hosted `AnekLatin` variable font (`wdth` 75–125, `wght` 100–800) + `IBM Plex Mono` (`woff2`) |
| `core/web/launch.css` | Launch Showroom (`/`, `/launch.html`) wired to the Showroom & Console schemes, Anek width scale, 26px cards, and motion tokens |
| `core/web/console.css` | Operator Console (`/console.html`) wired to the Console dark scheme, Anek width scale, 26px/20px blocks, and `scale(0.96)` press physics |
| `core/web/style.css` | Public Verifier (`/verify.html`) wired to the Console dark scheme, Anek width scale, and 26px tonal cards |

---

## 2. Principles

1. **Look up top, reach down low.** A big wide title fills the top to read from across the booth. Actions — defect placement, mission start, adversarial beats, and verification — sit grouped in the lower dock within easy reach.
2. **One family, three widths.** `Anek Latin` goes *wide* (`wdth 118–125`) for headers in clean sentence case, *normal* (`wdth 100`) for reading, and *narrow* (`wdth 75–85`, `tabular-nums`) for telemetry, latencies, checkpoints, altitudes and costs. Cryptographic hashes and signatures use `IBM Plex Mono`.
3. **Flat, tonal, rounded.** There are no drop shadows. White `#FFFFFF` cards on an `#F5F5F7` showroom ground — or `#1D1D1F` cards on `#000000` console ground — grouped into big `26px` blocks, show the depth.
4. **Blue acts, Flame flags.** Anything you tap to act is Apple Blue (`#0071E3`). Flame (`#FF8A3D` / `#FF9500`) appears in eyebrows, flagged defects (`cracked_cell`), and the holding moment. It is never used for a primary action button, so the two roles don't mix.

---

## 3. Colour — Apple Blue, Flame, Emerald & Graphite

Each hue has a 10-step ramp (`50` to `900`).

| Ramp | Role | Brand step | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Apple Blue** | Primary · trust, every action | `500` (`#0071E3`) | `#EAF4FF` | `#D6EAFF` | `#ADDBFF` | `#66B5FF` | `#2997FF` | `#0071E3` | `#0066CC` | `#004E9E` | `#00356B` | `#001C3D` |
| **Flame** | Warmth & telemetry · flagged defects | `500` (`#FF9500`) | `#FFF4E8` | `#FFE5CA` | `#FFC894` | `#FFA85E` | `#FF8A3D` | `#FF9500` | `#BF4800` | `#8F3600` | `#5E2300` | `#331200` |
| **Emerald** | Verified & sealed · TEE proof, anchors | `500` (`#34C759`) | `#EBF9EE` | `#CEF0D6` | `#9CE0AD` | `#65D181` | `#32D74B` | `#34C759` | `#1D8A3A` | `#15682B` | `#0E461D` | `#072610` |
| **Graphite** | Text, chrome, console & verifier | `900` (`#000000`) | `#F5F5F7` | `#E8E8ED` | `#D2D2D7` | `#A1A1A6` | `#86868B` | `#6E6E73` | `#424245` | `#2C2C2E` | `#1D1D1F` | `#000000` |

### Status colours

Every checkpoint / verification state has one colour, always paired with a text label:

- **Flagged · Holding**: `#FF9500` (soft `#FFE5CA` / `#331200`)
- **0G Signed · Acting**: `#0071E3` (soft `#D6EAFF` / `#001C3D`)
- **Verified · Anchored**: `#34C759` (soft `#CEF0D6` / `#072610`)
- **Sealed TEE · Hold**: `#A78BFA` (soft `#EFEAFB` / `#241A3E`)
- **Lease active**: `#FFD60A` (soft `#FFF6CC` / `#332900`)
- **Refused · Safe stop**: `#FF453A` (soft `#FFE5E3` / `#3A1618`)

### Surfaces

- **Showroom (light)**: `surface.ground #F5F5F7`, `surface.card #FFFFFF`, `surface.tint #EAF4FF`, `surface.warm #FFF4E8`
- **Console (dark)**: `ground #000000`, `card #1D1D1F`, `tint #001C3D`, `warm #331200`

---

## 4. Typography — Anek

Variable family (`wdth 75–125`, `wght 100–800`) self-hosted in `/vendor/fonts/`.

| Token | Specimen | Size / Line · Wght · Wdth |
|---|---|---|
| `display` | **Blackbox** | `56/60 · 750 · 125` |
| `title.large` | **The decision, sealed in a TEE.** | `36/42 · 700 · 122` |
| `title.medium` | **Solar farm O&M survey** | `26/32 · 650 · 118` |
| `title.small` | **Checkpoint 2 · Cracked cell** | `20/26 · 650 · 112` |
| `body.large` | **An inspection drone makes calls that cost money.** | `18/26 · 400 · 100` |
| `body` | **The robot checks 0G's signature before a rotor changes speed.** | `16/24 · 400 · 100` |
| `label` | **Start mission** | `15/20 · 600 · 105` |
| `caption` | **MuJoCo Skydio X2 · 10 Hz replay** | `13/18 · 500 · 100` |
| `overline` | **SEALED INFERENCE** | `12/16 · 700 · 110` |
| `numeric` | **14.2 s · 3.00 m · < 1¢** | `20/24 · 600 · 80 · tabular-nums` |

---

## 5. Components & Shape

- **Pills (`999px`)**: All buttons, scenario segments, camera segments, status chips.
- **Cards (`26px`)**: Bento tiles, verifier cards, HUD cards, highlight cards. Flat tonal fill, no drop shadows.
- **Tiles (`20px`)**: Pipeline steps, checkpoint cards, comparison blocks.
- **Sheets (`32px`)**: Checkpoint inspection modal, verifier report modal, live verify-before-actuate sheet.
- **Min button height**: `52px` primary CTAs (`44px` compact console controls).

---

## 6. Motion — Quick out, soft landing

- `press`: `150ms cubic-bezier(0.22, 1, 0.36, 1)` — buttons, tiles, checkpoint rows scale to `0.96` on `:active`.
- `standard`: `300ms cubic-bezier(0.33, 0, 0.1, 1)` — tabs, scenario segments, status badge cross-fades.
- `emphasized`: `450ms cubic-bezier(0.22, 1, 0.36, 1)` — live checkpoint card enter, modal sheet open, scroll reveals.
- `exit`: `200ms cubic-bezier(0.4, 0, 1, 1)` — modal close, toast dismiss.
- Respects `prefers-reduced-motion: reduce` (collapses to `150ms` fade, disables scale).
