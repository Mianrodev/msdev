import { sql } from "drizzle-orm";
import {
  backToMySpaceAction,
  cancelInviteAction,
  inviteAction,
  resetLinkAction,
  setPersonActiveAction,
  viewSpaceAction,
} from "./actions";
import { InviteMaker, LinkButton, SubmitButton } from "@/components/client";
import { fmtWhen } from "@/components/plain";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { records } from "@/db/schema";
import { listInvites, listPeople, OWNER_ID } from "@/lib/auth";
import { getOwnerSession } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { ctx, viewing } = await getOwnerSession();
  const [people, invites, counts] = await Promise.all([
    listPeople(ctx.db),
    listInvites(ctx.db),
    ctx.db
      .select({ ws: records.workspaceId, n: sql<number>`count(*)::int` })
      .from(records)
      .groupBy(records.workspaceId),
  ]);
  const leads = new Map(counts.map((c) => [c.ws, c.n]));
  const now = new Date().toISOString();
  const pending = invites.filter((i) => !i.usedAt && i.expiresAt > now);

  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Team"
        intro="Invite someone to run their own job search here. They get a private space — their own leads, search words, About me and rules. After they join, remind them to type their own job titles and country on Find leads: the examples there are yours. You can open anyone's space to help."
      />
      {viewing && (
        <form action={backToMySpaceAction} style={{ marginBottom: "1rem" }}>
          <SubmitButton className="primary">Back to my own space</SubmitButton>
        </form>
      )}

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Invite someone</h2>
        <InviteMaker make={inviteAction} />
      </section>

      <h2>People ({people.length})</h2>
      <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Leads</th>
              <th>Last signed in</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.id === OWNER_ID && <div className="small muted">Owner (you)</div>}
                </td>
                <td className="small">{p.email ?? "—"}</td>
                <td className="small">{leads.get(p.workspaceId) ?? 0}</td>
                <td className="small">{p.lastSignInAt ? fmtWhen(p.lastSignInAt) : "Not yet"}</td>
                <td className="small">{p.status === "active" ? "✓ Can sign in" : "Switched off"}</td>
                <td>
                  {p.role === "member" && (
                    <div className="row" style={{ gap: ".4rem" }}>
                      {viewing?.id === p.id ? (
                        <span className="small muted">Open now</span>
                      ) : (
                        <form action={viewSpaceAction.bind(null, p.id)}>
                          <SubmitButton className="small" pending="Opening…">
                            Open their space
                          </SubmitButton>
                        </form>
                      )}
                      {p.status === "active" && (
                        <LinkButton
                          make={resetLinkAction.bind(null, p.id)}
                          label="Password link"
                          note="Send this to them: it lets them choose a new password (once, within 7 days)."
                        />
                      )}
                      <form action={setPersonActiveAction.bind(null, p.id, p.status !== "active")}>
                        <SubmitButton
                          className={p.status === "active" ? "small danger" : "small"}
                          pending="…"
                          confirm={
                            p.status === "active"
                              ? `Switch off ${p.name}? They're signed out and can't sign in. Nothing is deleted.`
                              : undefined
                          }
                        >
                          {p.status === "active" ? "Switch off" : "Switch on"}
                        </SubmitButton>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <>
          <h2>Waiting to join ({pending.length})</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Link works until</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                    </td>
                    <td className="small">{i.email}</td>
                    <td className="small">{fmtWhen(i.expiresAt)}</td>
                    <td>
                      <form action={cancelInviteAction.bind(null, i.id)}>
                        <SubmitButton className="small" pending="…">
                          Cancel invite
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="small muted" style={{ marginTop: "1.2rem" }}>
        When you open someone&apos;s space, a yellow bar shows whose it is, and anything you change there is recorded under your
        name in their Activity. Switching someone off keeps all their data.
      </p>
    </>
  );
}
