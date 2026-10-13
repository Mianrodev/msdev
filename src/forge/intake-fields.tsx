import type { Intake } from "./schema";

/** The intake form fields, shared by "New demo" and "Edit & rewrite". */
export function IntakeFields({ v }: { v?: Partial<Intake> }) {
  const t = (name: keyof Intake, label: string, placeholder = "", opts: { required?: boolean; type?: string } = {}) => (
    <label>
      {label}
      <input name={name} type={opts.type ?? "text"} defaultValue={(v?.[name] as string) ?? ""} placeholder={placeholder} required={opts.required} />
    </label>
  );
  const a = (name: keyof Intake, label: string, placeholder: string, rows = 3) => (
    <label className="full">
      {label}
      <textarea name={name} rows={rows} defaultValue={(v?.[name] as string) ?? ""} placeholder={placeholder} />
    </label>
  );
  return (
    <>
      <div className="fields">
        {t("businessName", "Business name *", "e.g. Vanguard Pipe & Water", { required: true })}
        {t("industry", "Trade", "e.g. Plumbing, HVAC, Roofing")}
        {t("city", "City", "e.g. Myrtle Beach, SC")}
        {t("phone", "Phone", "e.g. (646) 594-9379")}
      </div>
      <details style={{ marginTop: ".9rem" }}>
        <summary>More details (optional — the more you add, the more tailored it gets)</summary>
        <div className="fields" style={{ marginTop: ".8rem" }}>
          {a("services", "Services", "Comma or line separated, e.g. Drain cleaning, Water heaters, Leak detection")}
          {a("serviceAreas", "Service areas", "e.g. Myrtle Beach, Conway, Surfside Beach")}
          {a(
            "reviews",
            "Real reviews to quote",
            "Paste reviews, one per paragraph, optionally ending — Name, Town.\nLeave empty to show clearly-marked sample reviews.",
            4,
          )}
          {a("notes", "Other facts about the business", "e.g. Family owned since 2009, owner Matt, CA License #123, free estimates, 24/7")}
          {t("logoUrl", "Logo image link", "https://…", { type: "url" })}
          {t("heroImageUrl", "Hero photo link", "https://…", { type: "url" })}
          {t("primaryColor", "Brand colour", "#1673c9")}
        </div>
      </details>
    </>
  );
}
