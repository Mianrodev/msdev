import "./opportunities.css";
import { copyFor } from "@/brand/copy";
import { WorkspaceTabs } from "@/components/opportunities/client";
import { MODULE_IDS } from "@/core/opportunities/types";
import { getSession } from "@/services/request";

export default async function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  await getSession(); // every page below requires sign-in (the proxy also checks the cookie)
  const { mod } = copyFor();
  const tabs = [
    { href: "/opportunities", label: "Overview", icon: "overview", end: true },
    ...MODULE_IDS.map((id) => ({ href: `/opportunities/${id}`, label: mod(id, "name"), icon: id })),
    { href: "/opportunities/saved", label: "Saved & lists", icon: "saved" },
    { href: "/opportunities/profile", label: "Company profile", icon: "profile" },
    { href: "/opportunities/sources", label: "Sources", icon: "sources" },
  ];
  return (
    <>
      <WorkspaceTabs tabs={tabs} />
      {children}
    </>
  );
}
