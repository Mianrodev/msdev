"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

/** Top navigation with the current page highlighted. */
export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <>
      {links.map((l) => {
        const base = l.href.split("?")[0];
        const on = base === "/" ? path === "/" : path.startsWith(base);
        return (
          <Link key={l.href} href={l.href} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

/** A submit button that shows it's working and can't be double-clicked. */
export function SubmitButton({
  children,
  pending = "Working…",
  className = "primary",
  confirm,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  confirm?: string;
}) {
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

/** Copy some text to the clipboard. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

/** Makes a recovery code and shows it once — only a scrambled copy is stored, so it can't be shown again. */
export function RecoveryCodeMaker({ make, hasCode }: { make: () => Promise<{ code: string }>; hasCode: boolean }) {
  const [made, formAction] = useActionState(async () => make(), null);
  if (made)
    return (
      <div className="note stack">
        <strong>Your recovery code — write it down now</strong>
        <div className="recovery-code">{made.code}</div>
        <div>
          <CopyButton text={made.code} label="Copy the code" />
        </div>
        <p className="small" style={{ margin: 0 }}>
          Keep it somewhere safe outside this app (a notebook, or your phone&apos;s notes). If you ever forget your password,
          press &quot;Forgot your password?&quot; on the sign-in page and type this code. It works once, and it won&apos;t be
          shown again.
        </p>
      </div>
    );
  return (
    <form action={formAction}>
      <SubmitButton
        className={hasCode ? "" : "primary"}
        pending="Making your code…"
        confirm={hasCode ? "Make a new recovery code? Your old code will stop working." : undefined}
      >
        {hasCode ? "Make a new recovery code" : "Make my recovery code"}
      </SubmitButton>
    </form>
  );
}
