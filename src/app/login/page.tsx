import { loginAction, resetPasswordAction, setupAction } from "./actions";
import { one, type SearchParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH, passwordIsSet, passwordManagedByHost } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const error = one(sp.error);
  const firstVisit = !(await passwordIsSet(await getDb()));
  const forgot = one(sp.forgot) === "1";
  return (
    <div style={{ maxWidth: 400, margin: "10vh auto 0" }}>
      {firstVisit ? (
        <>
          <h1>Welcome — create your password</h1>
          <p className="muted">
            This is the first time the app has been opened. Choose the password you&apos;ll use to sign in. Only you will be able
            to get in.
          </p>
          <form action={setupAction} className="card stack">
            {error && <div className="flash error">{error}</div>}
            <label>
              New password (at least {MIN_PASSWORD_LENGTH} characters)
              <input
                type="password"
                name="password"
                autoFocus
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
              />
            </label>
            <label>
              Type it again
              <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <button type="submit" className="primary">
              Create password
            </button>
          </form>
        </>
      ) : (
        <>
          <h1>Sign in</h1>
          <p className="intro">Type the password you created when you first opened the app.</p>
          <form action={loginAction} className="card stack">
            {!forgot && error && <div className="flash error">{error}</div>}
            <input type="hidden" name="next" value={one(sp.next) ?? "/"} />
            <label>
              Password
              <input type="password" name="password" autoFocus={!forgot} required autoComplete="current-password" />
            </label>
            <button type="submit" className="primary">
              Sign in
            </button>
          </form>
          {!passwordManagedByHost() && (
            <details className="card" open={forgot} style={{ marginTop: "1rem" }}>
              <summary>Forgot your password?</summary>
              <p className="small muted">
                Type the recovery code you wrote down (dashes and capitals don&apos;t matter) and choose a new password.
              </p>
              <form action={resetPasswordAction} className="stack">
                {forgot && error && <div className="flash error">{error}</div>}
                <label>
                  Recovery code
                  <input name="code" required autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH-…" />
                </label>
                <label>
                  New password (at least {MIN_PASSWORD_LENGTH} characters)
                  <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
                </label>
                <label>
                  Type it again
                  <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
                </label>
                <button type="submit" className="primary">
                  Set new password
                </button>
              </form>
              <p className="small muted">
                No recovery code? The app can&apos;t let anyone in without one — that&apos;s what keeps your data safe. Ask
                whoever set up your hosting to reset the password for you.
              </p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
