import { notFound } from "next/navigation";
import { archiveDemoAction, regenerateDemoAction } from "../actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { fmtWhen } from "@/components/plain";
import { BackLink, Flash, PageHeader, type SearchParams } from "@/components/ui";
import { demoSites } from "@/forge/base-url";
import { canUseAi } from "@/forge/generate";
import { IntakeFields } from "@/forge/intake-fields";
import { getDemo, getGhlPageUrl, ghlLink } from "@/forge/store";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function DemoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getCtx();
  const demo = await getDemo(ctx, slug);
  if (!demo) notFound();
  const [sites, ghlPage] = await Promise.all([demoSites(), getGhlPageUrl(ctx)]);
  const direct = sites.page(slug);
  const ghl = ghlLink(ghlPage, slug);
  const link = ghl || direct;
  const i = demo.intake;
  const chat = `✅ Demo site ready: *${i.businessName}*${i.city ? ` (${i.city})` : ""}\n${link}`;
  const today = new Date().toISOString().slice(0, 10);
  const sheetRow = [today, i.businessName, demo.content.industry, i.city, i.phone, link].join("\t");

  return (
    <>
      <Flash sp={sp} />
      <BackLink href="/forge">Back to Forge Demo</BackLink>
      <PageHeader
        title={i.businessName}
        intro={`${demo.content.industry}${i.city ? ` · ${i.city}` : ""} · ${demo.writtenBy === "ai" ? "Written by Gemini" : "Drafted without AI"} · updated ${fmtWhen(demo.updatedAt)}`}
      >
        <a className="button primary" href={direct} target="_blank" rel="noreferrer">
          Open site ↗
        </a>
      </PageHeader>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Share it</h2>
        <div className="grid" style={{ gap: ".7rem" }}>
          <div className="spread">
            <span>
              <b>Direct link</b> <span className="mono small">{direct}</span>
            </span>
            <CopyButton text={direct} label="Copy" />
          </div>
          <div className="spread">
            <span>
              <b>GoHighLevel link</b>{" "}
              {ghl ? <span className="mono small">{ghl}</span> : <span className="muted small">Set up your GoHighLevel page on the Forge Demo page first.</span>}
            </span>
            {ghl && <CopyButton text={ghl} label="Copy" />}
          </div>
          <div className="spread">
            <span>
              <b>Google Chat message</b> <span className="muted small">{chat.replace(/\n/g, " · ")}</span>
            </span>
            <CopyButton text={chat} label="Copy" />
          </div>
          <div className="spread">
            <span>
              <b>Sheet row</b> <span className="muted small">date · business · trade · city · phone · link — paste into the first empty row</span>
            </span>
            <CopyButton text={sheetRow} label="Copy" />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <iframe
          src={`/p/${slug}`}
          title={`Preview of ${i.businessName}`}
          style={{ width: "100%", height: "75vh", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "#fff" }}
        />
      </section>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>Edit &amp; rewrite</h2>
        <p className="muted small">Change the details and rewrite the site. The links stay the same.</p>
        <form action={regenerateDemoAction}>
          <input type="hidden" name="slug" value={slug} />
          <IntakeFields v={i} />
          <div style={{ marginTop: "1rem" }}>
            <SubmitButton pending={canUseAi() ? "Rewriting… (up to a minute)" : "Rebuilding…"}>Rewrite site</SubmitButton>
          </div>
        </form>
      </section>

      <form action={archiveDemoAction}>
        <input type="hidden" name="slug" value={slug} />
        <SubmitButton className="small danger" pending="Archiving…" confirm="Archive this demo? Its links stop working.">
          Archive demo
        </SubmitButton>
      </form>
    </>
  );
}
