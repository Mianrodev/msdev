import { redirect } from "next/navigation";
import { signInAction } from "./actions";
import { activeBrand } from "@/brand/brands";
import { Flash, one, type SearchParams } from "@/components/ui";
import { ownerSetupProblem } from "@/lib/auth";
import { currentSession } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  if (await currentSession()) redirect("/opportunities");
  const brand = activeBrand();
  const setup = ownerSetupProblem();
  return (
    <div className="card" style={{ maxWidth: 440, margin: "8vh auto 0" }}>
      <h1>Sign in</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {brand.productName}
      </p>
      <Flash sp={sp} />
      <form action={signInAction} className="stack">
        <input type="hidden" name="next" value={one(sp.next) ?? "/opportunities"} />
        <label>
          Email
          <input type="email" name="email" required autoComplete="username" defaultValue={one(sp.email) ?? ""} />
        </label>
        <label>
          Password
          <input type="password" name="password" required autoComplete="current-password" />
        </label>
        <button type="submit" className="primary">
          Sign in
        </button>
      </form>
      {setup ? (
        <div className="note" style={{ marginTop: "1rem" }}>
          <strong>Setup needed.</strong> {setup}
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: "1rem" }}>
          Forgot your password? Team members: ask the owner for a new temporary password. Owner: change <code>OWNER_PASSWORD</code> in
          the hosting settings and redeploy.
        </p>
      )}
    </div>
  );
}
