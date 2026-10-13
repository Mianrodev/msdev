import { profileAction } from "../actions";
import { PendingButton } from "@/components/opportunities/client";
import { Flash, type SearchParams } from "@/components/ui";
import { getProfile } from "@/services/opportunities/profile";
import { getCtx } from "@/services/request";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await getProfile(await getCtx());
  return (
    <>
      <Flash sp={sp} />
      <h1>Company profile</h1>
      <p className="intro">Used to explain tender matches: which services a notice mentions, whether it&apos;s in your regions and contract range, and which certifications it asks for. It stays in your workspace and is never sent to a data source.</p>
      <form action={profileAction} className="op-panel stack" style={{ maxWidth: 820 }}>
        <div className="fields">
          <label>
            Company name
            <input name="companyName" defaultValue={p.companyName} maxLength={200} />
          </label>
          <label>
            Currency for contract values
            <select name="currency" defaultValue={p.currency ?? ""}>
              <option value="">Not set</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="full">
            What you do
            <textarea name="description" defaultValue={p.description} rows={3} maxLength={2000} />
          </label>
          <label className="full">
            Services <span className="hint">(comma-separated — used for matching)</span>
            <input name="services" defaultValue={p.services.join(", ")} placeholder="e.g. website design, accessibility audit, user research" />
          </label>
          <label>
            Categories
            <input name="categories" defaultValue={p.categories.join(", ")} placeholder="e.g. digital services, IT services" />
          </label>
          <label>
            Regions you serve
            <input name="regions" defaultValue={p.regions.join(", ")} placeholder="e.g. Scotland, Northshire, United Kingdom" />
          </label>
          <label className="full">
            Certifications you hold
            <input name="certifications" defaultValue={p.certifications.join(", ")} placeholder="e.g. Cyber Essentials, ISO 9001" />
          </label>
          <label>
            Smallest contract worth bidding for
            <input name="minContractValue" type="number" min={0} defaultValue={p.minContractValue ?? ""} />
          </label>
          <label>
            Largest contract you can deliver
            <input name="maxContractValue" type="number" min={0} defaultValue={p.maxContractValue ?? ""} />
          </label>
          <label>
            Days you need to prepare a bid
            <input name="minPrepDays" type="number" min={0} max={365} defaultValue={p.minPrepDays} />
          </label>
        </div>
        <div>
          <PendingButton className="primary" pending="Saving…">
            Save profile
          </PendingButton>
        </div>
      </form>
    </>
  );
}
