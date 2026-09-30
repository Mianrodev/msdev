import { changePasswordAction, makeRecoveryCodeAction, ownerEmailAction, signOutEverywhereAction } from "../login/actions";
import { RecoveryCodeMaker, SubmitButton } from "@/components/client";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { hasRecoveryCode, MIN_PASSWORD_LENGTH, OWNER_ID, passwordManagedByHost } from "@/lib/auth";
import { getSession } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, user } = await getSession();
  const isOwner = user.id === OWNER_ID;
  if (isOwner && passwordManagedByHost())
    return (
      <>
        <PageHeader title="Password" intro="Your password is set in the hosting settings, so it's changed there." />
      </>
    );
  const hasCode = await hasRecoveryCode(ctx.db, user.id);
  return (
    <>
      <Flash sp={sp} />
      <PageHeader title="Password" intro="Change your password, and keep a recovery code in case you forget it." />
      <p className="muted" style={{ marginTop: "-.4rem" }}>
        Signed in as <strong>{user.name}</strong>
        {user.email ? ` (${user.email})` : ""}
        {isOwner ? " — the owner" : ""}.
      </p>

      <section className="card" id="recovery" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>
          Recovery code{" "}
          {hasCode ? <span className="pill ready small">Saved</span> : <span className="pill hold small">Not made yet</span>}
        </h2>
        <p className="muted">
          {hasCode
            ? "You have a recovery code. If you've lost it, make a new one — the old one stops working."
            : "If you forget your password, this code is the only way back in. Make it now and write it down somewhere safe."}
        </p>
        <RecoveryCodeMaker make={makeRecoveryCodeAction} hasCode={hasCode} />
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Signed in somewhere else?</h2>
        <p className="muted">
          Used a shared or borrowed computer? This signs out every other device straight away. You stay signed in here.
          (Changing your password does this too.)
        </p>
        <form action={signOutEverywhereAction}>
          <SubmitButton className="" pending="Signing out other devices…" confirm="Sign out every other device?">
            Sign out everywhere else
          </SubmitButton>
        </form>
      </section>

      {isOwner && (
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Your email (optional)</h2>
          <p className="muted">
            You can sign in with just your password. Add your email if you&apos;d like to sign in the same way as your team.
          </p>
          <form action={ownerEmailAction} className="inline">
            <label style={{ flex: "1 1 280px" }}>
              Email
              <input name="email" type="email" defaultValue={user.email ?? ""} placeholder="you@example.com" />
            </label>
            <SubmitButton pending="Saving…">Save email</SubmitButton>
          </form>
        </section>
      )}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <form action={changePasswordAction} className="stack" style={{ maxWidth: 440 }}>
          <label>
            Current password
            <input type="password" name="current" required autoComplete="current-password" />
          </label>
          <label>
            New password <span className="hint">(at least {MIN_PASSWORD_LENGTH} characters)</span>
            <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
          </label>
          <label>
            Type the new password again
            <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
          </label>
          <div>
            <SubmitButton pending="Saving…">Change password</SubmitButton>
          </div>
        </form>
      </section>
    </>
  );
}
