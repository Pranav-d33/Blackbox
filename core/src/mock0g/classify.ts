/**
 * DEV-ONLY heuristic "vision model" for the mock. It is tuned to the sim's own
 * procedural textures (robot/blackbox_robot/world.py and solar_world.py) and is
 * not a real classifier. It judges defect / benign / unsure; the server maps
 * that onto the labels and actions the mission profile's prompt declares.
 */
import { PNG } from "pngjs";

export type Verdict = { truth: "defect" | "benign" | "unsure"; severity: number };

export function classify(png: Buffer): Verdict {
  const img = PNG.sync.read(png);
  return isPanel(img) ? panel(img) : concrete(img);
}

type Img = { width: number; height: number; data: Buffer };

function isPanel({ width, height, data }: Img): boolean {
  let blue = 0;
  for (let i = 0; i < width * height * 4; i += 4 * 7) if (data[i + 2] > data[i] + 18) blue++;
  return blue > (width * height) / 7 / 3;
}

/** Concrete deck: thin, jagged, grey cracks vs yellow paint and thick cable. */
function concrete({ width, height, data }: Img): Verdict {
  let n = 0;
  let sat = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.max(Math.abs(r - 152), Math.abs(g - 150), Math.abs(b - 146)) <= 45) continue;
      n++;
      sat += Math.max(r, g, b) - Math.min(r, g, b);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (n < 150) return { truth: "unsure", severity: 0 };
  if (sat / n > 60) return { truth: "benign", severity: 0 }; // paint
  const meanWidth = n / Math.max(1, Math.hypot(maxX - minX, maxY - minY));
  if (meanWidth > 10) return { truth: "benign", severity: 0 }; // thick and uniform: a cable
  return { truth: "defect", severity: meanWidth < 5 ? 1 : meanWidth < 7 ? 2 : 3 };
}

/** PV modules: bright thin fracture lines vs soft brown dust or white blobs. */
function panel({ width, height, data }: Img): Verdict {
  // min channel per pixel: frames and backsheet stay below ~210 even with resampling ringing
  const lo = new Uint8Array(width * height);
  let warm = 0;
  for (let p = 0; p < width * height; p++) {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
    lo[p] = Math.min(r, g, b);
    if (r > 95 && r > b + 25 && g > b + 10) warm++;
  }
  let lines = 0, blob = 0;
  const R = 3;
  const solid = (p: number, t: number) => lo[p - R] > t && lo[p + R] > t && lo[p - R * width] > t && lo[p + R * width] > t;
  for (let y = R; y < height - R; y++)
    for (let x = R; x < width - R; x++) {
      const p = y * width + x;
      if (lo[p] > 198 && solid(p, 198)) blob++; // white droppings: solid patches
      else if (lo[p] > 215) lines++; // glass fractures: thin bright lines
    }
  if (lines > 150 && lines > blob * 2) return { truth: "defect", severity: lines < 500 ? 1 : lines < 1200 ? 2 : 3 };
  if (blob > 40 || warm > 600) return { truth: "benign", severity: 0 };
  return { truth: "unsure", severity: 0 };
}

/** Labels and actions from the answer template in the profile's prompt. */
export function vocabularyFromPrompt(prompt: string): { labels: string[]; actions: string[] } {
  const labels = /"label":"([^"]+)"/.exec(prompt)?.[1]?.split("|") ?? ["crack", "decoy", "unsure"];
  const actions = /"action":"([^"]+)"/.exec(prompt)?.[1]?.split("|") ?? ["descend", "continue"];
  return { labels, actions };
}

/** Convention of every profile: labels = [defect, benign, ..., "unsure"], actions = [inspect, skip]. */
export function toAnswer(v: Verdict, prompt: string): { label: string; severity: number; action: string } {
  const { labels, actions } = vocabularyFromPrompt(prompt);
  const unsure = labels.includes("unsure") ? "unsure" : labels[0];
  if (v.truth === "defect") return { label: labels[0], severity: v.severity, action: actions[0] };
  if (v.truth === "benign") return { label: labels[1] ?? labels[0], severity: 0, action: actions[1] ?? actions[0] };
  return { label: unsure, severity: 0, action: actions[0] };
}
