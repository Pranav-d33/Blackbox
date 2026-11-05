# Blackbox Design System · V2 (Apple Colour Scheme)

> **Proof that reads at a glance.** One visual language for the Launch Showroom, the Operator Console and the Public Verifier: calm Apple-system surfaces, wide headers you read from across the room, and controls where your hand already is.

Replica of the CHARAK Design System · V2 architecture (principles, 4×10 colour ramps, dual light/dark schemes, Anek variable-width typography, 26px tonal cards, 999px pills, and quick-out/soft-landing motion) adapted to **Apple's keynote & HIG colour scheme** and implemented across Blackbox (`core/web/`).

## Tokens

Link `tokens/colors_and_type.css` (generated from `design-system/tokens.json`). It loads self-hosted **Anek Latin** (`wdth` 75–125, `wght` 100–800) + **IBM Plex Mono** and defines:

- **4 × 10-step ramps**: `--blue-50…900` (Apple Blue `#0071E3` / `#2997FF`), `--flame-50…900` (Apple Orange `#FF9500` / `#FF8A3D`), `--emerald-50…900` (Apple Green `#34C759` / `#32D74B`), `--graphite-50…900` (Apple Graphite `#1D1D1F` / `#000000`).
- **Two schemes**: `--showroom-*` (light ground `#F5F5F7`, card `#FFFFFF`) and `--console-*` (dark ground `#000000`, card `#1D1D1F`). Roles: ground, card, tint, warm, fill, text, text-muted, text-faint, line, line-strong, primary, primary-soft, on-primary-soft, accent-warm, success, warning, danger, plus 6 status soft/on pairs (`flagged`, `acting`, `verified`, `sealed`, `waiting`, `refused`).
- **Type**: `--type-<style>` + `--type-<style>-width`: display 56/60 w125, title-large 36/42 w122, title-medium 26/32 w118, title-small 20/26 w112, body-large 18/26 w100, body 16/24 w100, label 15/20 w105, caption 13/18 w100, overline 12/16 w110, numeric 20/24 w80 tabular.
- **Shape**: `--radius-pill 999px`, `--radius-sheet 32px`, `--radius-card 26px`, `--radius-tile 20px`; `--size-button-min-height 52px`.
- **Motion**: `--dur-press 150ms`, `--dur-standard 300ms`, `--dur-emphasized 450ms`, `--dur-exit 200ms` with `cubic-bezier(0.22, 1, 0.36, 1)` and `cubic-bezier(0.33, 0, 0.1, 1)` curves; tappable elements scale to `0.96` on `:active`.

## Rules

1. **Look up top, reach down low.** Big wide title fills the top to read; demo beats, defect placement, and verification actions sit grouped below within easy reach.
2. **One family, three widths.** Anek goes *wide* (`118%–125%`) for headers in sentence case, *normal* (`100%`) for reading, and *narrow* (`75%–85%` + `tabular-nums`) for telemetry, latencies, checkpoints and fees. Hashes and signatures use `IBM Plex Mono`.
3. **Flat, tonal, rounded.** No drop shadows. White `#FFFFFF` cards on `#F5F5F7` showroom ground (or `#1D1D1F` cards on `#000000` console ground), grouped into 26px blocks, show the depth.
4. **Blue acts, Flame flags.** Anything you tap to act is Apple Blue (`#0071E3`). Flame (`#FF8A3D` / `#FF9500`) appears in eyebrows, flagged defects (`cracked_cell`), and the holding moment — never for a primary action button.
