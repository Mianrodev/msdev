import { describe, expect, it } from "vitest";
import { getAnswers, saveAnswers } from "@/services/answers";
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
});
