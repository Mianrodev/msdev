import Link from "next/link";
import { createDemoAction, saveGhlPageAction } from "./actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { fmtWhen } from "@/components/plain";
import { Flash, PageHeader, type SearchParams } from "@/components/ui";
import { appBaseUrl } from "@/forge/base-url";
import { canUseClaude } from "@/forge/generate";
import { IntakeFields } from "@/forge/intake-fields";
import { loaderSnippet } from "@/forge/loader";
import { getGhlPageUrl, listDemos } from "@/forge/store";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";
// Claude can take up to a minute or so to write a site.
export const maxDuration = 300;

export default async function ForgePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const [demos, ghlPage, base] = await Promise.all([listDemos(ctx), getGhlPageUrl(ctx), appBaseUrl()]);
  const ai = canUseClaude();
  return (
    <>
      <Flash sp={sp} />
      <PageHeader
        title="Forge Demo"
        intro="Type in a business and get a ready-to-show demo website in about a minute. Every demo gets a shareable link, and shows on your GoHighLevel page too once it's set up below."
      />

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0 }}>New demo website</h2>
        {!ai && (
          <p className="note small">
            No Anthropic API key is set, so sites are drafted from the trade template without AI. Add <code>ANTHROPIC_API_KEY</code> to
            the environment for copy written for each business.
          </p>
        )}
        <form action={createDemoAction} className="stack">
          <IntakeFields />
          <div style={{ marginTop: "1rem" }}>
            <SubmitButton pending={ai ? "Writing the site… (up to a minute)" : "Building…"}>Build demo website</SubmitButton>
          </div>
        </form>
      </section>

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>Demos ({demos.length})</h2>
        {demos.length === 0 ? (
          <p className="muted">No demos yet. Build the first one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Trade</th>
                  <th>Made</th>
                  <th>Links</th>
                </tr>
              </thead>
              <tbody>
                {demos.map((d) => (
                  <tr key={d.slug}>
                    <td>
                      <Link href={`/forge/${d.slug}`}>{d.businessName}</Link>
                    </td>
                    <td>{String((d.content as { industry?: string }).industry ?? "")}</td>
                    <td className="small muted">{fmtWhen(d.createdAt)}</td>
                    <td className="row">
                      <a href={`/p/${d.slug}`} target="_blank" rel="noreferrer">
                        Open site ↗
                      </a>
                      <CopyButton text={`${base}/p/${d.slug}`} label="Copy link" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Show demos on your GoHighLevel page</h2>
        <ol className="small" style={{ paddingLeft: "1.2rem", display: "grid", gap: ".4rem" }}>
          <li>
            In GoHighLevel (Mianro Systems), create a blank funnel or website page with no header or footer — e.g. <i>/demo</i>.
          </li>
          <li>
            Add one full-width <b>Custom JS/HTML</b> element and paste the code below into it. Save and publish.
          </li>
          <li>Paste that page&apos;s published address here. Every demo then also gets a link on your own domain.</li>
        </ol>
        <form action={saveGhlPageAction} className="row" style={{ margin: ".8rem 0 1rem" }}>
          <input name="ghlPageUrl" type="url" defaultValue={ghlPage} placeholder="https://yourdomain.com/demo" style={{ flex: "1 1 320px" }} />
          <SubmitButton className="small" pending="Saving…">
            Save page
          </SubmitButton>
        </form>
        <div className="spread">
          <b className="small">Code for the Custom JS/HTML element</b>
          <CopyButton text={loaderSnippet(base)} label="Copy code" />
        </div>
        <pre className="package mono small">{loaderSnippet(base)}</pre>
      </section>
    </>
  );
}
