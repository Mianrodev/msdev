"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
