import Link from "next/link";
import { joinAction } from "../../login/actions";
import { one, type SearchParams } from "@/components/ui";
import { getDb } from "@/db/client";
import { inviteFor, MIN_PASSWORD_LENGTH } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SearchParams }) {
  const { token } = await params;
  const sp = await searchParams;
  const error = one(sp.error);
  const invite = await inviteFor(await getDb(), token);
  return (
    <div style={{ maxWidth: 440, margin: "10vh auto 0" }}>
      {!invite ? (
        <>
          <h1>This invite link doesn&apos;t work</h1>
          <p className="intro">
            It may have been used already, cancelled, or it&apos;s more than 7 days old. Ask the person who invited you for a new
            link. Already joined? <Link href="/login">Sign in</Link>.
          </p>
        </>
      ) : (
        <>
          <h1>{invite.userId ? `Choose a new password, ${invite.name}` : `Welcome, ${invite.name}`}</h1>
          <p className="intro">
            {invite.userId
              ? "Your old password stops working, and you're signed out everywhere else. "
              : "You've been invited to the job tracker. You'll get your own private space — your own leads, search words and settings. Choose a password to finish. "}
            You&apos;ll sign in with <strong>{invite.email}</strong>.
          </p>
          <form action={joinAction.bind(null, token)} className="card stack">
            {error && <div className="flash error">{error}</div>}
            <label>
              Choose a password (at least {MIN_PASSWORD_LENGTH} characters)
              <input type="password" name="password" autoFocus required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label>
              Type it again
              <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <button type="submit" className="primary">
              {invite.userId ? "Save my new password" : "Create my account"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
