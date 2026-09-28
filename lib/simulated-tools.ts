/**
 * lib/simulated-tools.ts
 *
 * The Agent Action Firewall NEVER executes anything real. Every "tool" here
 * returns a canned description of what *would* have happened. This is
 * deliberate and non-negotiable for a teaching project: the lesson is about
 * the gate, not the side effect.
 *
 * If you fork this to build something real, the contract stays the same —
 * `execute()` is only ever called after `evaluateFirewall()` returned "auto".
 */

export interface SimulatedResult {
  simulated: true;
  tool: string;
  args: Record<string, unknown>;
  effect: string;
}

const EFFECTS: Record<string, (args: Record<string, unknown>) => string> = {
  read_file: (a) => `Would read ${a.path} (simulated: returned 42 lines)`,
  list_dir: (a) => `Would list ${a.path} (simulated: 7 entries)`,
  search_code: (a) => `Would grep for "${a.query}" under ${a.path} (simulated: 3 matches)`,
  http_get: (a) => `Would GET ${a.url} (simulated: 200 OK, 1.2 KB)`,
  write_file: (a) => `Would write ${String(a.content ?? "").length} chars to ${a.path}`,
  run_tests: (a) => `Would run tests under ${a.path} (simulated: 118 passed, 0 failed)`,
  git_commit: (a) => `Would commit with message "${a.message}" (simulated sha: 9f3c2a1)`,
  send_email: (a) => `Would email ${a.to} — "${a.subject}"`,
  delete_file: (a) => `Would delete ${a.path} (simulated — nothing removed)`,
  drop_table: (a) => `Would DROP TABLE ${a.table} in ${a.environment} (simulated — nothing dropped)`,
  shell: (a) => `Would run \`${a.command}\` (simulated — nothing executed)`,
  git_push_force: (a) => `Would force-push ${a.branch} (simulated — nothing pushed)`,
};

export function executeSimulated(tool: string, args: Record<string, unknown>): SimulatedResult {
  const fn = EFFECTS[tool];
  return {
    simulated: true,
    tool,
    args,
    effect: fn ? fn(args) : `No simulator for "${tool}" — nothing happened`,
  };
}
