/**
 * lib/experiments/support.ts — Experiment 1: Support Decision Pipeline
 *
 * incoming ticket → ONE decision call with three typed questions
 *                 → deterministic gates → action / stronger model / human
 *
 * Why three questions in one call? Jev is priced on input tokens and answers
 * all questions in a single forward pass, so "speculative fan-out" (ask
 * everything you might need up front) is nearly free. Downstream code reads
 * only the answers it needs.
 *
 * What the model decides:      department, P(refund requested), frustration
 * What code decides:           eligibility, $ limit, date window, escalation,
 *                              the confidence gate, and what action to take
 */

import { choice, noul, score } from "../jev";
import { recordsFromResponse } from "../metrics";
import {
  DEFAULT_GATE,
  DEFAULT_REFUND_POLICY,
  confidenceGate,
  evaluateRefund,
  frustrationEscalation,
  type GateThresholds,
} from "../policy-engine";
import type { ChoiceAnswer, DecisionProvider, DecisionRequest, NoulAnswer, PipelineStage, PipelineTrace, Route, ScoreAnswer, SupportTicket } from "../types";

export const FRUSTRATION_LEVELS = [
  "calm — neutral or friendly tone",
  "mildly annoyed — a small complaint, still polite",
  "frustrated — clear dissatisfaction, repeated issue",
  "angry — demands, deadlines, threats to cancel",
  "furious — threats of legal action, chargebacks, or public escalation",
];

export function buildSupportRequest(t: SupportTicket): DecisionRequest {
  return {
    // Everything the model may need, nothing it shouldn't have (no card numbers, no eligibility flags —
    // those are for code). Giving the model the tier is fine; it is context, not a decision.
    state: {
      subject: t.subject,
      body: t.body,
      customerTier: t.customer.tier,
      accountAgeDays: t.customer.accountAgeDays,
    },
    questions: {
      department: choice("Which team should own this ticket?", {
        billing: "Charges, invoices, refunds, credits, payment methods",
        technical: "Bugs, errors, outages, performance, missing features",
        account: "Login, password, 2FA, email changes, SSO configuration, permissions, account deletion",
        sales: "Pricing, quotes, seats, discounts, plan changes, procurement paperwork",
      }),
      refundRequested: noul("Is the customer asking for money back (a refund, credit, reversal, or threatening a chargeback)?", {
        true: "They want money returned or credited, explicitly or implicitly",
        false: "They are not asking for money back, or explicitly say they are not",
      }),
      frustration: score("How frustrated is the customer?", FRUSTRATION_LEVELS),
    },
  };
}

export async function runSupport(
  ticket: SupportTicket,
  provider: DecisionProvider,
  opts: { gate?: GateThresholds } = {},
): Promise<PipelineTrace> {
  const gate = opts.gate ?? DEFAULT_GATE;
  const req = buildSupportRequest(ticket);
  const stages: PipelineStage[] = [];

  stages.push({
    kind: "state",
    owner: "code",
    title: "Incoming ticket",
    summary: `${ticket.subject} · ${ticket.customer.tier} · ${ticket.order ? `$${ticket.order.amountUsd} order` : "no order"}`,
    data: { state: req.state, questions: req.questions },
  });

  // ---- The single semantic call --------------------------------------------
  const res = await provider.decide(req);
  const department = res.answers.department as ChoiceAnswer;
  const refund = res.answers.refundRequested as NoulAnswer;
  const frustration = res.answers.frustration as ScoreAnswer;

  stages.push({
    kind: "decision",
    owner: "model",
    title: `Decision · ${res.model}`,
    summary: `department=${department.choice} (${department.confidence.toFixed(2)}) · P(refund)=${refund.noul.toFixed(2)} · frustration≈${frustration.score.toFixed(1)}`,
    data: { answers: res.answers, usage: res.usage, estimatedCostUsd: res.estimatedCostUsd, warnings: res.warnings },
    durationMs: res.latencyMs,
  });

  // ---- Deterministic gates ---------------------------------------------------
  const deptGate = confidenceGate(department, gate);
  stages.push({
    kind: "gate",
    owner: "code",
    title: "Confidence gate · department",
    summary: deptGate.reason,
    route: deptGate.route,
    data: { thresholds: gate, margin: deptGate.margin, ambiguous: deptGate.ambiguous, probabilities: department.probabilities },
  });

  const refundDecision = evaluateRefund({
    refundRequested: refund,
    customer: ticket.customer,
    order: ticket.order ? { amountUsd: ticket.order.amountUsd, purchasedAt: daysAgoIso(ticket.order.purchasedDaysAgo) } : undefined,
  });
  stages.push({
    kind: "policy",
    owner: "code",
    title: "Refund policy",
    summary: `${refundDecision.action} — ${refundDecision.reason}`,
    data: { policy: DEFAULT_REFUND_POLICY, checks: refundDecision.checks },
  });

  const esc = frustrationEscalation(frustration);
  stages.push({
    kind: "policy",
    owner: "code",
    title: "Frustration escalation",
    summary: esc.reason,
    data: { legend: frustration.legend, probabilities: frustration.probabilities, escalate: esc.escalate },
  });

  // ---- Combine into one final route (code, again) ---------------------------
  // Priority: human review beats stronger model beats auto. Escalation on
  // frustration forces a human regardless of routing confidence.
  let finalRoute: Route = deptGate.route;
  const reasons: string[] = [deptGate.reason];
  if (esc.escalate) {
    finalRoute = "human-review";
    reasons.push("frustration escalation");
  }
  if (refundDecision.action === "route-to-billing-agent") {
    finalRoute = finalRoute === "auto" ? "human-review" : finalRoute;
    reasons.push("refund outside auto-approve limits");
  }

  const action =
    finalRoute === "auto"
      ? refundDecision.action === "auto-refund"
        ? `Auto-refund $${ticket.order?.amountUsd} and route to ${department.choice} queue`
        : `Auto-route to ${department.choice} queue`
      : finalRoute === "stronger-model"
        ? `Re-classify with a stronger model, then route`
        : `Hold for human review (${reasons.slice(1).join(", ") || "low confidence"})`;

  stages.push({
    kind: "action",
    owner: finalRoute === "auto" ? "simulated-tool" : "code",
    title: finalRoute === "auto" ? "Automatic action (simulated)" : finalRoute === "stronger-model" ? "Escalate to stronger model" : "Human review",
    summary: action,
    route: finalRoute,
    data: { reasons, refundAction: refundDecision.action },
  });

  // ---- Metrics ---------------------------------------------------------------
  const flags: string[] = [];
  if (ticket.ambiguous) flags.push("ambiguous");
  if (deptGate.ambiguous) flags.push("near-tie");
  const metrics = recordsFromResponse(
    "support",
    ticket.id,
    res,
    {
      department: ticket.labels.department,
      refundRequested: String(ticket.labels.refundRequested),
      frustration: String(ticket.labels.frustration),
    },
    finalRoute,
    flags,
  );

  return {
    experiment: "support",
    exampleId: ticket.id,
    provider: res.provider,
    stages,
    metrics,
    outcome: {
      route: finalRoute,
      decision: department.choice,
      confidence: department.confidence,
      expected: ticket.labels.department,
      correct: department.choice === ticket.labels.department,
    },
    response: res,
  };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
