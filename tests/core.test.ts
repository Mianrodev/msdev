import { describe, expect, it } from "vitest";
import { dedupKey, normalizeUrl } from "@/core/dedup";
import { assertCan, assertOutreachChange, can, PermissionError } from "@/core/permissions";
import { decide, PipelineError, reconcileDecision } from "@/core/pipeline";
import { redactRow, RECORD_FIELD_CLASSES, scrubText } from "@/core/redaction";
import { evaluate, type RuleLike } from "@/core/rules";

const rule = (r: Partial<RuleLike>): RuleLike => ({
  key: "k",
  label: "k",
  appliesFrom: "screen",
  field: "value",
  operator: "gte",
  value: 100,
  enabled: true,
  ...r,
});

describe("rules", () => {
  it("treats UNKNOWN as unknown, never as a failure", () => {
    const ev = evaluate([rule({})], { value: "UNKNOWN" }, "screen");
    expect(ev.unknowns).toHaveLength(1);
    expect(ev.fails).toHaveLength(0);
  });
  it("fails a genuine violation below a floor", () => {
    expect(evaluate([rule({})], { value: "90" }, "screen").fails).toHaveLength(1);
    expect(evaluate([rule({})], { value: "$150k" }, "screen").passes).toHaveLength(1);
  });
  it("matches whole words so NO does not match NOT DISCLOSED", () => {
    const r = rule({ operator: "excludes_all", value: ["NO"], field: "loc" });
    expect(evaluate([r], { loc: "NO (on-site)" }, "screen").fails).toHaveLength(1);
    expect(evaluate([r], { loc: "NOT DISCLOSED" }, "screen").fails).toHaveLength(0);
  });
  it("routes hold-effect violations to holds", () => {
    const r = rule({ operator: "excludes_all", value: ["gig"], field: "t", effect: "hold" });
    const ev = evaluate([r], { t: "gig marketplace" }, "screen");
    expect(ev.holds).toHaveLength(1);
    expect(ev.fails).toHaveLength(0);
  });
  it("only applies rules from their stage onward", () => {
    expect(evaluate([rule({ appliesFrom: "verify" })], { value: 1 }, "screen").results).toHaveLength(0);
    expect(evaluate([rule({ appliesFrom: "verify" })], { value: 1 }, "verify").fails).toHaveLength(1);
  });
});

describe("pipeline", () => {
  const ok = evaluate([], {}, "screen");
  const state = { stage: "discovery" as const, status: "active" as const, sourceVerification: "unverified" as const };

  it("requires a reason", () => {
    expect(() => decide(state, { stage: "screen", verdict: "keep_strong", reason: " " }, ok)).toThrow(PipelineError);
  });
  it("refuses out-of-order stages", () => {
    expect(() => decide(state, { stage: "verify", verdict: "tier_good", reason: "x" }, ok)).toThrow(/Next decision/);
  });
  it("refuses to advance past a genuine violation", () => {
    const bad = evaluate([rule({})], { value: 1 }, "screen");
    expect(() => decide(state, { stage: "screen", verdict: "keep_strong", reason: "x" }, bad)).toThrow(/Cannot advance/);
    expect(decide(state, { stage: "screen", verdict: "reject", reason: "below floor" }, bad).status).toBe("archived");
  });
  it("advances with an unknown criterion", () => {
    const unk = evaluate([rule({})], { value: "UNKNOWN" }, "screen");
    expect(decide(state, { stage: "screen", verdict: "keep_possible", reason: "x" }, unk).stage).toBe("screen");
  });
  it("never promotes an unverified source at verify", () => {
    const s = { ...state, stage: "triage" as const };
    expect(() => decide(s, { stage: "verify", verdict: "tier_strong", reason: "x" }, ok)).toThrow(/Hold/);
    const held = decide(s, { stage: "verify", verdict: "hold_needs_info", reason: "can't reach" }, ok);
    expect(held.status).toBe("hold");
    const v = decide({ ...s, sourceVerification: "verified" }, { stage: "verify", verdict: "tier_strong", reason: "x" }, ok);
    expect(v).toMatchObject({ stage: "verify", status: "active", fitTier: "strong" });
  });
  it("reconciliation archives violations and holds unverified sources", () => {
    expect(reconcileDecision("verified", evaluate([rule({})], { value: 1 }, "all")).action).toBe("archive");
    expect(reconcileDecision("unreachable", ok).action).toBe("hold");
    expect(reconcileDecision("verified", ok).action).toBe("keep");
  });
});

describe("dedup", () => {
  it("ignores scheme, www, trailing slash, tracking params and company suffixes", () => {
    expect(normalizeUrl("https://www.Example.com/jobs/1/?utm_source=x")).toBe("example.com/jobs/1");
    expect(dedupKey({ account: "Acme, Inc.", opportunity: "Ops Lead", sourceUrl: "http://example.com/jobs/1" })).toBe(
      dedupKey({ account: "acme", opportunity: "ops  lead", sourceUrl: "https://www.example.com/jobs/1/" }),
    );
  });
  it("falls back to the next-step URL", () => {
    expect(dedupKey({ account: "a", opportunity: "b", nextStepUrl: "x.com/1" })).toBe("a|b|x.com/1");
  });
});

describe("permissions", () => {
  const human = { kind: "human" as const, id: "o" };
  const sys = { kind: "system" as const, process: "p" };
  it("has no way to send or submit", () => {
    expect(can(human, "outreach.send")).toBe(false);
    expect(() => assertCan(human, "outreach.submit")).toThrow(PermissionError);
  });
  it("only a confirming human can record outreach actions", () => {
    expect(() => assertOutreachChange(sys, "sent_manually", true)).toThrow(PermissionError);
    expect(() => assertOutreachChange(human, "sent_manually", false)).toThrow(/confirming/);
    expect(() => assertOutreachChange(human, "sent_manually", true)).not.toThrow();
    expect(() => assertOutreachChange(sys, "package_ready", false)).toThrow(PermissionError);
  });
});

describe("redaction", () => {
  it("drops restricted fields and scrubs identity terms, emails and phones", () => {
    const row = {
      account: "Acme",
      fitRationale: "Jane Doe led CRM at Globex; reach jane@x.com or +1 (305) 555-0100",
      preparedBrief: "secret",
      contactName: "Bob",
      someNewColumn: "unclassified",
      dateFound: "2026-09-25",
    };
    const out = redactRow(row, RECORD_FIELD_CLASSES, "shared", ["Jane Doe", "Globex"]);
    expect(out).not.toHaveProperty("preparedBrief");
    expect(out).not.toHaveProperty("contactName");
    expect(out).not.toHaveProperty("someNewColumn");
    expect(out.fitRationale).toBe("[REDACTED] led CRM at [REDACTED]; reach [REDACTED] or [REDACTED]");
    expect(out.dateFound).toBe("2026-09-25");
  });
  it("leaves dates alone", () => {
    expect(scrubText("on 2026-09-25", [])).toBe("on 2026-09-25");
  });
});

describe("starts-with operators and unknown phrasing", () => {
  const r = rule({ operator: "not_starts_with_any", value: ["NO"], field: "fit" });
  it("does not trip on a NO later in the text", () => {
    expect(evaluate([r], { fit: "YES (no restriction stated)" }, "screen").fails).toHaveLength(0);
    expect(evaluate([r], { fit: "NO (on-site)" }, "screen").fails).toHaveLength(1);
    expect(evaluate([r], { fit: "NOTABLE" }, "screen").fails).toHaveLength(0);
  });
  it("treats 'UNKNOWN (…)' and 'NOT DISCLOSED' as unknown", () => {
    const f = rule({ operator: "excludes_all", value: ["below floor"], field: "v" });
    expect(evaluate([f], { v: "UNKNOWN (competitive salary stated)" }, "screen").unknowns).toHaveLength(1);
    expect(evaluate([rule({})], { value: "Not disclosed" }, "screen").unknowns).toHaveLength(1);
  });
});
