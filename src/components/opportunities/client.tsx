"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";

/** Workspace navigation with the current section marked for screen readers (aria-current). */
export function WorkspaceTabs({ tabs }: { tabs: { href: string; label: string; icon: string; end?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav className="op-tabs" aria-label="Opportunity workspace">
      {tabs.map((t) => {
        const on = t.end ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}>
            <Icon name={t.icon} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const STEPS = ["Contacting sources", "Reading and normalising records", "Removing duplicates", "Ranking against your criteria", "Saving evidence"];

/**
 * Search button plus a progress panel while the search runs. The steps are the real pipeline stages
 * in order; their timing is an estimate (the server reports the outcome when it finishes).
 */
export function SearchSubmit({ label, pending }: { label: string; pending: string }) {
  const { pending: busy } = useFormStatus();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 700);
    return () => {
      clearInterval(t);
      setStep(0);
    };
  }, [busy]);
  return (
    <>
      <button type="submit" className="primary big" disabled={busy} aria-busy={busy} style={{ width: "100%" }}>
        {busy ? pending : label}
      </button>
      <div role="status" aria-live="polite">
        {busy && (
          <ol className="op-progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? "done" : i === step ? "on" : undefined}>
                <span className="dot" aria-hidden="true" />
                {s}
                {i === step ? "…" : ""}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}

/** A 0–5 weight slider that shows its value. */
export function RangeField({ name, label, defaultValue, min = 0, max = 5, step = 1 }: { name: string; label: string; defaultValue: number; min?: number; max?: number; step?: number }) {
  const [v, setV] = useState(defaultValue);
  const id = `range-${name}`;
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="op-range">
        <input id={id} type="range" name={name} min={min} max={max} step={step} value={v} onChange={(e) => setV(Number(e.target.value))} aria-valuetext={`${v} of ${max}`} />
        <output htmlFor={id}>{v}</output>
      </div>
    </div>
  );
}

/** Generic submit with pending text (re-exported pattern from components/client for this area). */
export function PendingButton({ children, pending = "Working…", className = "", confirm }: { children: React.ReactNode; pending?: string; className?: string; confirm?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={busy}
      aria-busy={busy}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {busy ? pending : children}
    </button>
  );
}

/** Status select that saves on change (no JS fallback: the form also has a Save button inside <noscript>). */
export function AutoSubmitSelect({ name, defaultValue, options, label }: { name: string; defaultValue: string; options: { value: string; label: string }[]; label: string }) {
  const { pending } = useFormStatus();
  return (
    <label>
      {label}
      <select name={name} defaultValue={defaultValue} disabled={pending} aria-busy={pending} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
