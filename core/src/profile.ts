/**
 * Mission profiles: the task pack that makes Blackbox general. A profile names
 * the world, the sim settings, the labels the sealed model may answer, the
 * robot actions it may choose, and the prompt. It is copied into the mission
 * manifest, so it goes to 0G Storage and is fixed by the root registered on
 * 0G Chain before takeoff; the robot loads its policy from that manifest.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./config";

export interface WorldKind {
  kind: string;
  name: string;
  truth: "defect" | "benign";
  variants: number;
}

export interface Profile {
  v: 1;
  kind: "blackbox.mission-profile";
  id: string;
  title: string;
  summary: string;
  robot: string;
  world: { kind: string; kinds: WorldKind[]; [k: string]: unknown };
  sim: Record<string, unknown>;
  decision: {
    labels: string[];
    actions: string[];
    severity_max: number;
    label_actions: Record<string, string>;
    prompt: string;
  };
  ui: { labels: Record<string, { name: string; color: string }>; skin: string };
}

export const SCENARIO_DIR = process.env.BLACKBOX_SCENARIOS ?? join(REPO_ROOT, "scenarios");
const ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const WORD = /^[a-z][a-z0-9_]{0,31}$/;

export function validateProfile(p: any): Profile {
  const fail = (m: string) => {
    throw new Error(`profile ${p?.id ?? "?"}: ${m}`);
  };
  if (p?.kind !== "blackbox.mission-profile" || p.v !== 1) fail("not a v1 blackbox.mission-profile");
  if (!ID.test(p.id ?? "")) fail("id must be lowercase letters, digits and dashes");
  const d = p.decision ?? {};
  for (const k of ["labels", "actions"] as const) {
    if (!Array.isArray(d[k]) || !d[k].length || !d[k].every((w: unknown) => typeof w === "string" && WORD.test(w)))
      fail(`decision.${k} must be a non-empty list of snake_case words`);
    if (new Set(d[k]).size !== d[k].length) fail(`decision.${k} has duplicates`);
  }
  if (!Number.isInteger(d.severity_max) || d.severity_max < 0 || d.severity_max > 10) fail("decision.severity_max must be 0..10");
  if (typeof d.prompt !== "string" || d.prompt.length < 40) fail("decision.prompt is missing");
  const template = `"label":"${d.labels.join("|")}"`;
  if (!d.prompt.includes(template)) fail(`decision.prompt must contain the answer template ${template}`);
  if (!d.prompt.includes(`"action":"${d.actions.join("|")}"`)) fail("decision.prompt must list the actions in its answer template");
  for (const [label, action] of Object.entries(d.label_actions ?? {})) {
    if (!d.labels.includes(label)) fail(`label_actions names unknown label ${label}`);
    if (!d.actions.includes(action as string)) fail(`label_actions maps ${label} to unknown action ${action}`);
  }
  if (typeof p.world?.kind !== "string" || !Array.isArray(p.world?.kinds) || !p.world.kinds.length) fail("world.kind and world.kinds are required");
  if (!Array.isArray(p.sim?.deck_mm) || p.sim.deck_mm.length !== 2) fail("sim.deck_mm must be [w, h]");
  return p as Profile;
}

export function listProfiles(): Profile[] {
  if (!existsSync(SCENARIO_DIR)) return [];
  return readdirSync(SCENARIO_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => validateProfile(JSON.parse(readFileSync(join(SCENARIO_DIR, f), "utf8"))));
}

export function loadProfile(id: string): Profile {
  const p = listProfiles().find((x) => x.id === id);
  if (!p) throw new Error(`unknown scenario ${JSON.stringify(id)} (have: ${listProfiles().map((x) => x.id).join(", ")})`);
  return p;
}

/** What goes into the manifest's `sim`: the profile's settings plus the world spec. */
export function simSection(p: Profile, backend: string) {
  return { backend, ...p.sim, world: p.world };
}

/** What goes into the manifest's `policy`: the vocabulary the robot's interlock enforces. */
export function vocabulary(p: Profile) {
  return { labels: p.decision.labels, actions: p.decision.actions, severity_max: p.decision.severity_max };
}
