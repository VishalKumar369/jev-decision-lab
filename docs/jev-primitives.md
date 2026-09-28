# Jev primitives

A field guide to the three question types, how to phrase them, and the patterns this lab uses. Everything here applies to the direct API, OpenRouter and Vercel — the request body is the same.

## The wire format

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json

{
  "model": "jev-latest",
  "state": { "subject": "Charged twice", "body": "Two $49 charges this month, please refund one." },
  "questions": {
    "department":      { "type": "choice", "instructions": "Which team owns this?", "criteria": { "billing": "…", "technical": "…" } },
    "refundRequested": { "type": "noul",   "instructions": "Is the customer asking for money back?" },
    "frustration":     { "type": "score",  "instructions": "How frustrated is the customer?", "criteria": ["calm", "annoyed", "angry"] }
  }
}
```

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "department":      { "type": "choice", "choice": "billing", "confidence": 0.94, "probabilities": { "billing": 0.94, "technical": 0.06 } },
    "refundRequested": { "type": "noul",   "noul": 0.97 },
    "frustration":     { "type": "score",  "score": 0.8, "confidence": 0.61, "legend": { "0": "calm", "1": "annoyed", "2": "angry" }, "probabilities": { "0": 0.35, "1": 0.5, "2": 0.15 } }
  },
  "usage": { "input_tokens": 212, "output_tokens": 31 }
}
```

Other hosts: OpenRouter is `POST https://openrouter.ai/api/alpha/decisions` with `"model": "typesafe/jev-1.13"` and adds `usage.cost`; Vercel AI Gateway is `POST https://ai-gateway.vercel.sh/v4/ai/evaluation-model` with model in a header and the answers map at the top level. `lib/jev.ts` handles all three.

State limit is about 30k tokens. Pin a snapshot (`jev-1.13`) for reproducible benchmarks; `jev-latest` for convenience.

## `choice` — pick one from a closed set

```ts
choice("Which team should own this ticket?", {
  billing:   "Charges, invoices, refunds, credits, payment methods",
  technical: "Bugs, errors, outages, performance, missing features",
  account:   "Login, password, 2FA, email changes, SSO, permissions",
  sales:     "Pricing, quotes, seats, discounts, procurement",
})
```

- The **descriptions are the prompt**. Vague descriptions → smeared distributions. Overlapping descriptions → near-ties that are your fault, not the model's.
- You get a probability for every label. `confidence` is how concentrated the distribution is; it is *not* "probability of being right" until calibration says so.
- **Label-set gaps show up as low confidence.** Ticket `t029` ("thanks, you can close this") has no good department. The right outcome is a flat distribution and a human — not a confident wrong answer. If you see many such cases, add a label.

## `score` — rate on an ordered rubric

```ts
score("How frustrated is the customer?", [
  "calm — neutral or friendly tone",
  "mildly annoyed — a small complaint, still polite",
  "frustrated — clear dissatisfaction, repeated issue",
  "angry — demands, deadlines, threats to cancel",
  "furious — legal threats, chargebacks, public escalation",
])
```

- Index 0 is lowest. Order matters; the model treats levels as ordinal.
- `score` is the probability-weighted expected level and may be fractional (2.4). Threshold on it in code: `frustration.score >= 3`.
- The per-level probabilities tell you *shape*. Two tickets can both have expected level 2 — one because it's clearly a 2, one because it's 50/50 between 1 and 3. The lab surfaces both.

## `noul` — probability a statement is true

```ts
noul("Is the customer asking for money back (refund, credit, reversal, or threatening a chargeback)?", {
  true:  "They want money returned or credited, explicitly or implicitly",
  false: "They are not asking for money back, or explicitly say they are not",
})
```

- Cheapest primitive. Composes well: ten nouls in one request instead of one "count the X" question (Jev is bad at counting; do sums in code).
- Phrase as a statement about the state that has a truth value. "Does this call serve the goal?" is good; "Should we allow this?" is bad — that's a policy question and it belongs in code.
- Include the implicit cases in the instructions (chargeback threats count as refund requests) rather than hoping.

## Patterns used in this lab

### Speculative fan-out
Ask every question you *might* need in one call. Jev prices on input tokens and answers all questions in one pass; batching 10 questions is ~7× faster and ~6× cheaper than 10 sequential calls. Downstream code reads only what it needs. `experiments/latency.ts` measures this.

### Confidence gate in code
```ts
const g = confidenceGate(answer, { auto: 0.85, escalate: 0.6 });
// g.route ∈ auto | stronger-model | human-review; g.margin = top − second; g.ambiguous = margin < 0.2
```
Thresholds are numbers in a file a PM can change. They should be *chosen from the calibration data*: if the 0.8–0.9 bucket is 90% accurate, 0.85 is a defensible auto threshold; if it's 60%, it isn't.

### Authorization before opinion
```ts
if (!customer.refundEligible) return deny();      // code, first, can veto
if (refund.noul < 0.7) return noRefundPath();     // model input, thresholded by code
if (amount > 250 || ageDays > 30) return human(); // arithmetic and dates, code
```

### Per-risk-class thresholds
The bar for acting on a model's judgment rises with the blast radius of being wrong: 0.5 for a read, 0.8 for a write, 0.95 for a destructive tool. The risk class is a property of the *tool*, set by humans in `TOOL_POLICY`, never inferred.

### What NOT to ask Jev
- Anything with a rule in it ("is this over the limit?") — do it in code.
- Open-ended generation ("write the reply") — that's an LLM's job, and the "stronger-model" route exists for it.
- Counting ("how many bugs are mentioned?") — ask one noul per candidate and sum.
- Anything where you'd need the reasoning — Jev doesn't produce one. Log the distribution instead.

## Calibration in practice

"Calibrated" is a population property. It means: over many answers where the model said 0.8, about 80% were right. It says nothing about any single answer. You verify it by running labelled data through the Calibration Lab and reading the reliability diagram, and you re-verify when you change question phrasing, because phrasing changes the distribution.
