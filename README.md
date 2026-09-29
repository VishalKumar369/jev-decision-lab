# jev-decision-lab

A small engineering lab for one question: **where does a decision model fit between deterministic code and general-purpose LLMs?**

Four interactive experiments, a benchmark runner and a calibration analysis. Every request records latency, tokens, cost, the full probability distribution, the decision, the confidence, the route the gate took and correctness against labelled data. Not a product, not a chatbot.

![Decision flow: input, model decision, confidence gate, policy, action](docs/assets/decision-flow.svg)

The model answers semantic questions. Code owns authorization, thresholds, arithmetic, dates, rate limits and execution. The gate is only legitimate if the model's confidence is calibrated, so there is an experiment for that too.

## Why Jev, and why now

For three years the answer to "how do I make my code understand this text?" has been "call an LLM and parse whatever comes back." It works, and it is slow, expensive and impossible to reason about: you asked for a category and got a paragraph, a confidence you cannot trust, and a JSON blob that is valid only most of the time.

On 15 September 2026 [TypeSafe AI](https://jevtypesafeai.com/), a small team that includes a former ChatGPT engineer, shipped [Jev](https://www.marktechpost.com/2026/09/19/typesafe-ai-releases-jev/) with a different contract. Jev does not generate text at all. You hand it a state and a set of typed questions (`choice`, `score`, `noul`), and it returns a probability for every answer you defined. Nothing to parse, nothing to hallucinate. TypeSafe borrowed Kahneman's phrase and calls it a "System One" model: fast intuition, no deliberation. It answers in roughly 100 ms, charges $0.042 per million input tokens, and output is free because there is no output.

The reaction was unusual for an inference product. Within 24 hours it became [the fastest-adopted model in Vercel AI Gateway history](https://vercel.com/blog/ai-gateway-jev-model-launch), reaching 13% of paid teams, twice the rate of the GPT-5.6 family and six times that of Fable 5.1. [OpenRouter](https://openrouter.ai/blog/insights/what-is-jev/) benchmarked it at more than five times faster than the next fastest model and gave it its own decisions endpoint. By the end of week two there were [1,316 posts from 965 builders](https://www.requesty.ai/blog/jev-week-two-four-gateways-open-clones-what-builders-shipped), four gateways giving it away, and three open-weight clones, one of them 421M parameters trained on a single GPU. What people shipped was telling: permission gates for coding agents, next-action selection for browser agents, model routers, judge replacements. Small, bounded decisions that sit in the hot path.

The skeptics were also right about something. Vendor benchmarks ("194x faster, 445x cheaper") are the best case. A confident wrong answer at 150 ms is still a wrong answer. And the entire pitch rests on one claim that only you can verify for your data: when Jev says 0.8, is it right 80% of the time?

That is what this lab is for. It puts Jev, plain code and general-purpose LLMs on the same typed contract, runs labelled data through all three, and lets you look at the distributions, the routes, the cost and the calibration yourself.

## Quick start

```bash
npm install
cp .env.example .env.local     # add TYPESAFE_API_KEY; DEFAULT_PROVIDER=jev
npm run dev                    # http://localhost:3000
```

With `TYPESAFE_API_KEY` and `OPENROUTER_API_KEY` set, **Support Pipeline** runs Jev (direct) + Claude + Gemini (via OpenRouter) in parallel on every ticket — latency, tokens, and estimated cost are shown side by side. Keys stay server-side only, never in frontend code or git. No key? Switch other experiments to `mock` to explore offline.

```bash
npm run bench -- --provider mock,jev    # datasets through each provider, JSON + CSV in results/
npm run calibration                     # reliability tables, ECE, Brier
npm run cost                            # $ per decision, $ per 1M decisions
npm run latency -- --provider jev       # percentiles, batched vs sequential
```

## Experiments

| # | Experiment | Model decides | Code decides |
|---|---|---|---|
| 1 | Support Pipeline | department, refund requested, frustration | eligibility, $ limit, date window, escalation, confidence gate |
| 2 | Agent Firewall | intent alignment, blast radius | allowlist, role, arguments, rate limit, per-risk thresholds. Nothing executes. |
| 3 | Model Router | complexity, domain, needs tools | tier mapping, cost/latency budget, no silent downgrade |
| 4 | Calibration Lab | none | buckets every prediction by confidence and checks whether 0.8 means 80% |

## Providers

One interface, swap by env var: TypeSafe Jev direct, Jev via OpenRouter or Vercel AI Gateway, and OpenAI / Anthropic / Gemini asked to answer the same typed questions as JSON (the fair LLM comparison). See `.env.example`.

## Read more

- [Deep dive](docs/deep-dive.md): what Jev is, what each experiment teaches, what gets recorded, how to read calibration
- [Architecture](docs/architecture.md): layers, the decision contract, the policy engine, results on disk
- [Jev primitives](docs/jev-primitives.md): `choice`, `score`, `noul`, wire format, patterns
- [Experiments guide](docs/experiments.md): which examples to try and what to look for
- [CLAUDE.md](CLAUDE.md): design principles for anyone (human or AI) changing the code

## Safety

The Agent Action Firewall never executes anything. All tools are simulated (`lib/simulated-tools.ts`).

MIT. Teach with it, fork it, break it.
