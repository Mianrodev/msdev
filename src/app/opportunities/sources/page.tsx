import { copyFor } from "@/brand/copy";
import { Chip, ExtLink, ModeChip } from "@/components/opportunities/ui";
import { MODULE_IDS } from "@/core/opportunities/types";
import { aiEnrichmentStatus } from "@/sources/opportunities/ai-enricher";
import { allProviders, PLANNED_LIVE } from "@/sources/opportunities/registry";
import { LIMITS } from "@/services/opportunities/usage";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const { mod } = copyFor();
  const providers = allProviders();
  const ai = aiEnrichmentStatus();
  return (
    <>
      <h1>Sources</h1>
      <p className="intro">Every data source this workspace can search, how its data may be used, and what each planned source still needs. Credentials stay on the server; nothing here is sent to the browser.</p>
      {MODULE_IDS.map((m) => (
        <section key={m} className="op-panel" aria-labelledby={`src-${m}`}>
          <h2 id={`src-${m}`}>{mod(m, "name")}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Status</th>
                  <th scope="col">Licence & storage</th>
                </tr>
              </thead>
              <tbody>
                {providers
                  .filter((p) => p.module === m)
                  .map((p) => {
                    const a = p.available();
                    return (
                      <tr key={p.id}>
                        <td className="wrap">
                          <strong>{p.homepage ? <ExtLink href={p.homepage}>{p.name}</ExtLink> : p.name}</strong>
                          <div className="muted small">{p.description}</div>
                        </td>
                        <td>
                          <ModeChip mode={p.mode} />
                        </td>
                        <td>{a.ok ? <Chip tone="ok">Available</Chip> : <Chip tone="warn" title={a.reason}>Unavailable</Chip>}</td>
                        <td className="wrap small">
                          {p.licenceUrl ? <ExtLink href={p.licenceUrl}>{p.licence ?? "Licence"}</ExtLink> : p.licence}
                          <div className="muted">{p.storagePolicy}</div>
                          {p.attribution && <div className="muted">Attribution: {p.attribution}</div>}
                        </td>
                      </tr>
                    );
                  })}
                {PLANNED_LIVE.filter((p) => p.module === m).map((p) => (
                  <tr key={p.name}>
                    <td className="wrap">
                      <strong>{p.name}</strong>
                    </td>
                    <td>
                      <Chip>Planned</Chip>
                    </td>
                    <td>
                      <Chip tone="neutral">Not connected</Chip>
                    </td>
                    <td className="wrap small">Needs: {p.needs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <section className="op-panel">
        <h2>AI enrichment and usage limits</h2>
        <ul>
          <li>
            AI summaries: {ai.enabled ? `on (${ai.model})` : `off — ${ai.reason}`} Summaries are optional, made on request for one record at a time, schema-validated, and always labelled.
          </li>
          <li>Searches per minute per workspace: {LIMITS.searchesPerMinute()}</li>
          <li>Live searches per day per workspace: {LIMITS.liveSearchesPerDay()}</li>
          <li>AI summaries per day per workspace: {LIMITS.aiSummariesPerDay()}</li>
        </ul>
      </section>
    </>
  );
}
