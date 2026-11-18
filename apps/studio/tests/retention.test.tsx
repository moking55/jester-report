import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/runs", () => ({ setRetention: vi.fn() }));

import { RetentionPanel } from "@/components/RetentionPanel";

afterEach(cleanup);

describe("RetentionPanel", () => {
  it("names both what the new limit deletes: history and stored PDFs", () => {
    render(
      <RetentionPanel
        retention={{ days: null, setBy: null, setAt: null, wouldDelete: 1240, wouldDeleteDocuments: 980 }}
        previewDays={90}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("1,240 รายการ");
    expect(text).toContain("เอกสาร PDF 980 ใบ");
    expect(text).toContain("กู้คืนไม่ได้");
    expect(screen.getByRole("button", { name: "ยืนยัน เก็บ 90 วัน" })).toBeTruthy();
  });

  it("counts zero when the api sends no document count", () => {
    render(<RetentionPanel retention={{ days: 30, wouldDelete: 0 }} previewDays={7} />);
    expect(document.body.textContent).toContain("เอกสาร PDF 0 ใบ");
  });
});
