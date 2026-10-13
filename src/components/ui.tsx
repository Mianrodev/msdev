import Link from "next/link";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** ?ok= / ?error= messages after a form action. */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ok = one(sp.ok);
  const error = one(sp.error);
  return (
    <>
      {ok && (
        <div className="flash ok" role="status">
          ✓ {ok}
        </div>
      )}
      {error && (
        <div className="flash error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="small" style={{ marginTop: 0 }}>
      <Link href={href}>← {children}</Link>
    </p>
  );
}
