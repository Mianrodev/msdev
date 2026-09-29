import { loginAction, setupAction } from "./actions";
import { one, type SearchParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { MIN_PASSWORD_LENGTH, passwordIsSet } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const error = one(sp.error);
  const firstVisit = !(await passwordIsSet(await getDb()));
  return (
    <div style={{ maxWidth: 400, margin: "10vh auto 0" }}>
      {firstVisit ? (
        <>
          <h1>Welcome — create your password</h1>
          <p className="muted">
            This is the first time the app has been opened. Choose the password you&apos;ll use to sign in. Only you will be
            able to get in.
          </p>
          <form action={setupAction} className="card stack">
            {error && <div className="flash error">{error}</div>}
            <label>
              New password (at least {MIN_PASSWORD_LENGTH} characters)
              <input type="password" name="password" autoFocus required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
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
          <form action={loginAction} className="card stack">
            {error && <div className="flash error">{error}</div>}
            <input type="hidden" name="next" value={one(sp.next) ?? "/"} />
            <label>
              Password
              <input type="password" name="password" autoFocus required autoComplete="current-password" />
            </label>
            <button type="submit" className="primary">
              Sign in
            </button>
          </form>
        </>
      )}
    </div>
  );
}
