import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const saves: { name: string; text: string; revision: number }[] = [];
let status = 200;
vi.mock("@/lib/actions/draft", () => ({
  saveFile: vi.fn(async (_id: string, name: string, text: string, revision: number) => {
    saves.push({ name, text, revision });
    return status === 200
      ? { ok: true, data: { revision: revision + 1 } }
      : { ok: false, problem: { type: "about:blank", title: "x", status, code: "REVISION_CONFLICT", detail: "", retryable: false } };
  }),
  prepareDraft: vi.fn(async () => ({ ok: true, data: { params: {}, data: {}, lists: {}, totals: {}, problems: [] } })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { DesignerPage, type DesignerApi } from "@/components/designer/DesignerPage";

afterEach(() => {
  cleanup();
  saves.length = 0;
  status = 200;
});

function setup(archived = false) {
  let api: DesignerApi | null = null;
  render(
    <DesignerPage
      templateId="t1"
      name="ทดสอบ"
      revision={3}
      files={{ "template.html": "<p>a</p>\n", "report.json": "{}" }}
      assets={[]}
      archived={archived}
      params="{}"
    >
      {(a) => {
        api = a;
        return <div data-testid="src">{a.src}</div>;
      }}
    </DesignerPage>,
  );
  return () => api!;
}

describe("DesignerPage", () => {
  it("saves template.html at the revision it loaded; undo/redo survive a save", async () => {
    const api = setup();
    expect(screen.getByRole("button", { name: "บันทึก" })).toHaveProperty("disabled", true);
    api().edit("<p>b</p>\n");
    await waitFor(() => expect(screen.getByTestId("src").textContent).toBe("<p>b</p>\n"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("บันทึกแล้ว"));
    expect(saves).toEqual([{ name: "template.html", text: "<p>b</p>\n", revision: 3 }]);
    fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
    expect(screen.getByTestId("src").textContent).toBe("<p>a</p>\n"); // back across the save
    expect(screen.getByRole("status").textContent).toBe("ยังไม่บันทึก");
    fireEvent.click(screen.getByRole("button", { name: "ทำซ้ำ" }));
    expect(screen.getByTestId("src").textContent).toBe("<p>b</p>\n");
  });

  it("stops on 412 and offers a reload, never overwrites", async () => {
    status = 412;
    const api = setup();
    api().edit("<p>b</p>\n");
    await waitFor(() => expect(screen.getByRole("button", { name: "บันทึก" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("มีคนแก้ draft นี้ก่อน"));
    expect(screen.getByRole("button", { name: "บันทึก" })).toHaveProperty("disabled", true);
  });

  it("is read-only when archived", () => {
    setup(true);
    expect(screen.getByText(/ถูก archive แล้ว/)).toBeTruthy();
  });
});
