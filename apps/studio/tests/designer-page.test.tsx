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

  it("page margins: report.json is saved only when it changed, after template.html, with the next revision", async () => {
    const api = setup();
    api().editReport('{"page": {"marginsMm": {"top": 25, "bottom": 20, "left": 15, "right": 15}}}');
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("ยังไม่บันทึก"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("บันทึกแล้ว"));
    expect(saves.map((x) => [x.name, x.revision])).toEqual([["report.json", 3]]);
    api().edit("<p>c</p>\n");
    api().editReport("{}");
    await waitFor(() => expect(screen.getByTestId("src").textContent).toBe("<p>c</p>\n"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(saves.length).toBe(3));
    expect(saves.slice(1).map((x) => [x.name, x.revision])).toEqual([
      ["template.html", 4],
      ["report.json", 5],
    ]);
    // one undo step per edit, across both files
    fireEvent.click(screen.getByRole("button", { name: "เลิกทำ" }));
    await waitFor(() => expect(api().report).toContain("marginsMm"));
    expect(api().src).toBe("<p>c</p>\n");
  });

  it("an image upload gets a safe name and the next save uses the revision it returned", async () => {
    const sent: { name: string; revision: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: FormData }) => {
        const file = init.body.get("file") as File;
        sent.push({ name: file.name, revision: String(init.body.get("revision")) });
        return new Response(JSON.stringify({ revision: 7, asset: { name: file.name } }), { status: 201 });
      }),
    );
    const api = setup();
    const name = await api().upload(new File(["x"], "โลโก้ บริษัท.PNG", { type: "image/png" }));
    expect(name).toBe("image.png");
    expect(sent).toEqual([{ name: "image.png", revision: "3" }]);
    api().edit("<p>after upload</p>");
    await waitFor(() => expect(screen.getByTestId("src").textContent).toBe("<p>after upload</p>"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(saves.length).toBe(1));
    expect(saves[0]).toMatchObject({ name: "template.html", revision: 7 });
    vi.unstubAllGlobals();
  });

  it("header and footer are files of their own: created when first edited, saved only if changed, in order", async () => {
    const api = setup();
    api().setPart("header");
    await waitFor(() => expect(api().part).toBe("header"));
    expect(api().src).toBe(""); // no header.html in this report yet
    api().edit('<div>หัว</div>');
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("ยังไม่บันทึก"));
    api().setPart("body");
    await waitFor(() => expect(api().part).toBe("body"));
    api().edit("<p>b</p>\n");
    await waitFor(() => expect(api().src).toBe("<p>b</p>\n"));
    fireEvent.click(screen.getByRole("button", { name: "บันทึก" }));
    await waitFor(() => expect(saves.length).toBe(2));
    expect(saves.map((x) => [x.name, x.revision, x.text])).toEqual([
      ["template.html", 3, "<p>b</p>\n"],
      ["header.html", 4, "<div>หัว</div>"],
    ]);
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
