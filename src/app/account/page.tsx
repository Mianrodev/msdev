import { addMemberAction, changePasswordAction, memberStatusAction, resetMemberAction, signOutEverywhereAction } from "./actions";
import { AddMemberForm, ResetPasswordButton } from "@/components/account";
import { PendingButton } from "@/components/opportunities/client";
import { fmtWhen } from "@/components/format";
import { Flash, type SearchParams } from "@/components/ui";
import { listUsers, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { getSession } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const s = await getSession();
  const owner = s.user.role === "owner";
  const team = owner ? await listUsers(s.ctx.db) : [];
  return (
    <div style={{ maxWidth: 860 }}>
      <Flash sp={sp} />
      <h1>{owner ? "Account & team" : "Account"}</h1>
      <p className="intro">
        Signed in as <strong>{s.user.email}</strong> ({owner ? "owner" : "team member"}).
      </p>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2>Password</h2>
        {owner ? (
          <p>
            The owner&apos;s email and password are the <code>OWNER_EMAIL</code> and <code>OWNER_PASSWORD</code> environment variables. To
            change or reset them, update the variables in the hosting settings (Cloudflare → this Worker → Settings → Variables and Secrets) and deploy again.
            Changing them signs the owner out everywhere.
          </p>
        ) : (
          <form action={changePasswordAction} className="stack" style={{ maxWidth: 380 }}>
            <label>
              Current password
              <input type="password" name="current" required autoComplete="current-password" />
            </label>
            <label>
              New password <span className="hint">({MIN_PASSWORD_LENGTH}+ characters)</span>
              <input type="password" name="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <label>
              New password again
              <input type="password" name="confirm" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
            </label>
            <div>
              <PendingButton className="primary" pending="Saving…">
                Change password
              </PendingButton>
            </div>
          </form>
        )}
        <form action={signOutEverywhereAction} style={{ marginTop: ".8rem" }}>
          <PendingButton className="small">Sign out on all other devices</PendingButton>
        </form>
      </section>

      {owner && (
        <section className="card">
          <h2>Team</h2>
          <p className="muted">Everyone on the team shares this workspace: searches, saved items, lists and notes.</p>
          <AddMemberForm action={addMemberAction} />
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <caption className="sr-only">Team members</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {team.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      {u.role === "owner" ? "Owner" : "Member"}
                      {u.status === "disabled" && <span className="badge hold"> switched off</span>}
                    </td>
                    <td className="small">{fmtWhen(u.lastSignInAt)}</td>
                    <td>
                      {u.role === "member" && (
                        <div className="row">
                          <ResetPasswordButton action={resetMemberAction.bind(null, u.id)} />
                          <form action={memberStatusAction.bind(null, u.id, u.status === "active" ? "disabled" : "active")}>
                            <PendingButton className="small">{u.status === "active" ? "Switch off" : "Switch on"}</PendingButton>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
