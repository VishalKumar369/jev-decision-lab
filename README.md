# jev-decision-lab

**An educational lab for understanding where TypeSafe Jev — a decision model — fits between deterministic code and general-purpose LLMs.**

Four interactive experiments, a benchmark runner, and a calibration analysis. Everything is measured: latency, tokens, cost, the full probability distribution, the decision, the confidence, the route the gate took, and correctness against hand-labelled data.

This is not a SaaS starter and not a chatbot. It exists so you can run the comparison yourself instead of trusting a blog post.

---

## The idea in one diagram

```
 incoming state ──▶ DECISION (model) ──▶ CONFIDENCE GATE (code) ──▶ POLICY (code) ──▶ ACTION
 ticket / tool      typed questions →      ≥ 0.85  auto              eligibility          simulated tool
 call / prompt      probabilities          ≥ 0.60  stronger model    limits, dates        escalation
                                           else    human review      allowlists, budgets  review queue
```

The model answers **semantic** questions and nothing else. Code owns authorization, thresholds, arithmetic, date comparisons, rate limits and execution. The gate is legitimate only if the model's confidence is *calibrated* — so there is an experiment for that too.

## What Jev is (30 seconds)

[TypeSafe Jev](https://jevtypesafeai.com/) is a "System One" model. You send a **state** (text or JSON) and a map of **typed questions**; it returns **calibrated probabilities** over the answers you defined. No prose, no tool calls, no reasoning trace.

| primitive | you give | you get back |
|---|---|---|
| `choice` | a set of labels with descriptions | a probability per label + arg-max + confidence |
| `score` | an ordered rubric (index 0 lowest) | a probability per level + expected level (fractional) |
| `noul` | a yes/no statement | P(true) |

Roughly 70–500 ms per call (~100 ms median), $0.042 per 1M input tokens, output free. That makes it cheap enough to call *inside* a request path where you would otherwise write a brittle regex or pay for an LLM round-trip. See [`docs/jev-primitives.md`](docs/jev-primitives.md).

## Quick start

```bash
git clone <this repo> && cd jev-decision-lab
npm install
cp .env.example .env.local        # add TYPESAFE_API_KEY (optional — see below)
npm run dev                       # http://localhost:3000
```

**No API key?** The lab ships with a `mock` provider: deterministic keyword heuristics with seeded noise. It is *not a model* — it is the "what if we just wrote code" baseline, and it is deliberately mediocre. Use it to learn the shape of the pipelines, then add a key and watch the numbers change.

Then run the scripts:

```bash
npm run bench -- --provider mock                 # all three datasets, offline
npm run bench -- --provider jev,openai           # compare providers you have keys for
npm run calibration                              # reliability tables + ECE from results/
npm run cost                                     # $/decision, $/1M decisions, output share
npm run latency -- --provider jev --n 20         # percentiles + batched vs sequential
```

Results land in `results/` as JSON (full traces) and CSV (one row per question).

## The four experiments

| # | Experiment | Model decides | Code decides | Lesson |
|---|---|---|---|---|
| 1 | **Support Decision Pipeline** | department, P(refund requested), frustration 0–4 | refund eligibility, $250 limit, 30-day window, frustration ≥ 3 → human, confidence gate | one call, three questions; policy is arithmetic, not vibes |
| 2 | **Agent Action Firewall** | P(intent aligned), blast radius | allowlist, role, argument validation, rate limit, per-risk-class thresholds | static checks first and they can veto; semantics catch what static checks can't (`a025`, `a027`) |
| 3 | **Model Router** | complexity 0–3, domain, P(needs tools) | tier mapping, tools ⇒ ≥ medium, cost/latency budget, refuse to silently downgrade | the routing call should cost less than the cheapest tier it routes to |
| 4 | **Calibration Lab** | — | buckets every recorded prediction by confidence; ECE, MCE, Brier; confident-but-wrong list | is 0.8 really 80%? if not, your gate thresholds are fiction |

Each experiment page is a three-column lab workspace: labelled examples on the left, the editable input in the centre (key fields as form controls, raw JSON one click away), and the decision result on the right. The result shows the full probability distribution first, then confidence/route/policy, then the sequence from input → model judgment → confidence gate → policy → action, with model-owned and code-owned steps visibly separated. Raw provider responses and the full trace stay available under collapsible sections. Detailed walk-throughs: [`docs/experiments.md`](docs/experiments.md).

## Providers

All providers implement one interface (`lib/types.ts#DecisionProvider`). Configure with env vars; see `.env.example`.

| name | kind | what it is |
|---|---|---|
| `mock` | heuristic | offline keyword rules — the code baseline, not a model |
| `jev` | decision model | TypeSafe Jev direct: `POST https://api.typesafe.ai/v1/systemone` |
| `openrouter-jev` | decision model | Jev via `POST https://openrouter.ai/api/alpha/decisions` (reports cost) |
| `vercel-jev` | decision model | Jev via Vercel AI Gateway evaluation-model endpoint (no usage reported) |
| `openai`, `anthropic`, `google`, `openrouter-llm` | LLM emulator | a chat model asked to answer the *same typed questions* as JSON with probabilities |

The LLM emulators are the fair comparison: this is exactly what teams do when they use an LLM as a classifier. The lab records the extra prompt tokens, the output tokens, the JSON repairs it had to make, and — in the Calibration Lab — whether the verbalised probabilities mean anything.

`ENABLED_PROVIDERS` is a deterministic allowlist so a curious click can't burn budget on a big model.

## What gets recorded for every request

```ts
interface MetricRecord {
  experiment; exampleId; provider; model;
  latencyMs; inputTokens; outputTokens; estimatedCostUsd;
  question; questionType;
  probabilities;          // full distribution, verbatim
  decision; confidence;
  expected; correct;      // only when the dataset has a label
  route;                  // auto | stronger-model | human-review | blocked
  flags;                  // ambiguous, near-tie, static-veto, provider-warning, ...
}
```

A request with three questions produces three rows. Cost is per request and de-duplicated in the summaries.

## Calibration, briefly

Bucket labelled predictions by confidence (default 10 bins). In each bucket compare the mean predicted probability with the fraction that were actually right. Perfect calibration is the diagonal.

- **ECE** — expected calibration error: bucket gaps weighted by bucket size. ~0.02–0.05 is very good; > 0.15 means the confidence number is not something to gate on.
- **MCE** — the worst single bucket.
- **Brier** — mean squared error of the chosen answer's probability.

The Calibration Lab also lists **confident-and-wrong** rows (the automation risk) and **ambiguous / near-tie** rows (the cases you should *not* automate — and where a spread-out distribution is the model doing its job).

## Datasets

Hand-labelled JSON in `datasets/`. Each row has an `id`, the input, a `labels` block (ground truth, never sent to the model), and optional `ambiguous: true` + `notes` where annotators disagreed. Add rows with a text editor; the benchmark picks them up.

- `support-tickets.json` — 30 tickets: department, refundRequested, frustration; includes negation traps, implicit refund requests, label-set gaps
- `agent-actions.json` — 28 proposed tool calls: intentAligned, risk, verdict; includes reward hacking, path traversal, wrong environment, aligned-but-forbidden
- `routing-prompts.json` — 30 prompts: complexity, domain, needsTools, tier

## Safety

The Agent Action Firewall **never executes anything**. `lib/simulated-tools.ts` returns descriptions of what *would* have happened. There is no shell, no filesystem write, no email, no database anywhere in the codebase.

## Project layout

See [`CLAUDE.md`](CLAUDE.md) for the layout and the design principles, and [`docs/architecture.md`](docs/architecture.md) for how the pieces fit.

## Sources

- TypeSafe Jev — [jevtypesafeai.com](https://jevtypesafeai.com/), [API console](https://console.typesafe.ai/keys)
- OpenRouter decisions endpoint — [What is Jev?](https://openrouter.ai/blog/insights/what-is-jev/)
- Direct API walkthrough — [flaviocopes.com/jev](https://flaviocopes.com/jev/)
- Coding guide with fan-out patterns — [MarkTechPost](https://www.marktechpost.com/2026/09/23/a-coding-guide-to-typesafe-ai-jev/)

## License

MIT. Teach with it, fork it, break it.
