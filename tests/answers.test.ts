import { describe, expect, it } from "vitest";
import { getAnswers, getProfile, saveAnswers, saveProfile } from "@/services/answers";
import { runAiTool } from "@/services/ai-tools";
import { listHistory } from "@/services/history";
import { testCtx } from "./helpers";

describe("saved answers", () => {
  it("keeps answers with text, names untitled ones, and logs without the text", async () => {
    const ctx = await testCtx();
    const n = await saveAnswers(ctx, [
      { title: " Notice period ", text: " 30 days notice. " },
      { title: "Expected pay", text: "" },
      { title: "", text: "Happy to work Australian hours." },
    ]);
    expect(n).toBe(2);
    expect(await getAnswers(ctx)).toEqual([
      { title: "Notice period", text: "30 days notice." },
      { title: "Answer 2", text: "Happy to work Australian hours." },
    ]);
    const log = JSON.stringify(await listHistory(ctx, { entityType: "setting" }));
    expect(log).not.toContain("30 days notice");
  });

  it("refuses an answer that is far too long", async () => {
    const ctx = await testCtx();
    await expect(saveAnswers(ctx, [{ title: "Essay", text: "x".repeat(9000) }])).rejects.toThrow(/too long/);
  });

  it("keeps the About me profile private: logged without its text, readable by your AI", async () => {
    const ctx = await testCtx();
    expect(await getProfile(ctx)).toBe("");
    await saveProfile(ctx, "  Remote only. Pay floor: 1.2 lakh/month.\r\nRoles: founder's office.  ");
    expect(await getProfile(ctx)).toBe("Remote only. Pay floor: 1.2 lakh/month.\nRoles: founder's office.");
    expect(JSON.stringify(await listHistory(ctx, { entityType: "setting" }))).not.toContain("Pay floor");
    expect((await runAiTool(ctx, "get_my_profile", {})).text).toContain("Pay floor");
    await expect(saveProfile(ctx, "x".repeat(30_001))).rejects.toThrow(/under/);
  });
});
