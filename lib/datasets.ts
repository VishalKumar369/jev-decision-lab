/**
 * lib/datasets.ts
 *
 * Server-side loader for the labelled JSON datasets. Used by API routes and by
 * the scripts in experiments/. Datasets are plain JSON on purpose: students
 * should be able to add a row with a text editor and re-run the benchmark.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentAction, ExperimentName, RoutingPrompt, SupportTicket } from "./types";

const ROOT = process.cwd();

function load<T>(file: string): T[] {
  const raw = readFileSync(join(ROOT, "datasets", file), "utf8");
  return JSON.parse(raw) as T[];
}

export const loadSupportTickets = () => load<SupportTicket>("support-tickets.json");
export const loadAgentActions = () => load<AgentAction>("agent-actions.json");
export const loadRoutingPrompts = () => load<RoutingPrompt>("routing-prompts.json");

export type AnyExample = SupportTicket | AgentAction | RoutingPrompt;

export function loadDataset(experiment: ExperimentName): AnyExample[] {
  switch (experiment) {
    case "support":
      return loadSupportTickets();
    case "agent-firewall":
      return loadAgentActions();
    case "model-router":
      return loadRoutingPrompts();
    case "calibration":
      // The calibration lab reuses all three datasets.
      return [...loadSupportTickets(), ...loadAgentActions(), ...loadRoutingPrompts()];
  }
}
