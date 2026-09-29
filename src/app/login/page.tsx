import { loginAction } from "./actions";
import { one, type SearchParams } from "@/components/ui";
import { authConfigured } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  return (
    <div style={{ maxWidth: 380, margin: "10vh auto 0" }}>
      <h1>Sign in</h1>
      {!authConfigured() ? (
        <p className="note">No password has been set yet. Add APP_PASSWORD in your hosting settings, then redeploy.</p>
      ) : (
        <form action={loginAction} className="card stack">
          {one(sp.error) && <div className="flash error">Wrong password.</div>}
          <input type="hidden" name="next" value={one(sp.next) ?? "/"} />
          <label>
            Password
            <input type="password" name="password" autoFocus required autoComplete="current-password" />
          </label>
          <button type="submit" className="primary">
            Sign in
          </button>
        </form>
      )}
    </div>
  );
}
