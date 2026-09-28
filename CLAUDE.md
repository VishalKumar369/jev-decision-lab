# CLAUDE.md — design principles for jev-decision-lab

This file is for AI coding assistants (and humans) working in this repo. It
states what the project is for and the rules that keep it honest. If a change
would violate one of these, stop and ask.

## What this is

A **teaching project**, not a product. Its single purpose is to let software
engineers *measure* where a decision model (TypeSafe Jev) fits relative to
deterministic code and general-purpose LLMs. Every feature should make a
trade-off visible; nothing should make one disappear.

## Non-negotiable principles

1. **Jev only makes semantic judgments.** "Which team?", "Is a refund being
   asked for?", "Does this tool call serve the goal?". It never decides
   authorization, thresholds, arithmetic, date comparisons, rate limits or
   execution. Those live in `lib/policy-engine.ts` as plain, unit-testable
   TypeScript. If you find yourself putting a business rule in a question's
   `instructions`, move it to code.

2. **Do not hide uncertainty.** Every decision surface shows the full
   probability distribution, not just the arg-max. Near-ties are flagged.
   Ambiguous dataset rows are marked `ambiguous: true` and *kept* — a
   low-confidence answer on an ambiguous input is correct behaviour. Raw wire
   responses are always one click away.

3. **Every request is measured.** Latency, token usage (when the provider
   reports it), estimated cost, the full distribution, the selected decision,
   confidence, the route the gate chose, and correctness when a label exists.
   The `MetricRecord` type in `lib/types.ts` is the contract; the benchmark,
   the calibration analysis and the UI all read it.

4. **Providers stay behind adapters.** Experiments call `provider.decide(req)`
   and never import a vendor client. Adding a provider means one entry in
   `lib/providers.ts`. The LLM adapters deliberately ask chat models to speak
   the *same* typed contract so the comparison is like-for-like.

5. **Nothing destructive is ever real.** The Agent Action Firewall uses
   `lib/simulated-tools.ts` only. There is no code path that runs a shell
   command, deletes a file, sends email or touches a database. Keep it that way.

6. **Not a chatbot.** There is no free-text prompt box that returns prose. The
   UI's job is to show input → judgment → confidence → policy → action, with
   accent colour carrying ownership (violet = model, cyan = code, orange =
   policy, green = simulated action). Most of the UI stays neutral.

7. **Comments are for junior-to-senior engineers.** Explain *why* a boundary
   exists, not what a `for` loop does. Prefer a two-line comment at the top of
   a function over inline noise.

## Layout

```
app/            Next.js pages + API routes (thin: parse → lib → JSON)
components/     UI. ResultPanel (decision first, model vs code separated) is the visual argument;
                ExperimentShell is the 3-column workspace; Sidebar holds nav + theme toggle.
lib/            All logic. No React here.
  types.ts        the shared vocabulary — read first
  jev.ts          Jev builders, wire normalisation, direct/OpenRouter/Vercel clients
  llm.ts          "LLM as decision emulator" comparison arm
  mock.ts         offline keyword heuristic (NOT a model) — the code baseline
  providers.ts    adapter registry
  policy-engine.ts  every deterministic rule; the most important file
  metrics.ts      MetricRecord creation, summaries, calibration/ECE, CSV
  experiments/    the three pipelines
datasets/       hand-labelled JSON; add rows with a text editor
experiments/    CLI scripts (tsx): benchmark, calibration, latency, cost
results/        generated; gitignored except .gitkeep
docs/           architecture, Jev primitives, experiment write-ups
```

## Conventions

- TypeScript strict. No `any` outside `raw` fields that hold vendor payloads.
- Raw `fetch` for vendor APIs so request bodies are visible in the source.
- Pricing lives in `lib/pricing.ts` and is an *estimate*; label it as such.
- Datasets use relative time (`purchasedDaysAgo`) so they never go stale.
- Scripts write both JSON (full fidelity) and CSV (spreadsheet-friendly).
- Keep the mock provider bad-but-honest. Do not tune it to look good.

## Things an assistant should not do here

- Add a chat interface or free-form generation.
- Move a threshold, limit or allowlist into a prompt.
- Add a real tool executor to the firewall.
- Collapse distributions to a single label in the UI.
- Introduce a UI framework or ORM; the repo is intentionally small.
