// v1.14.1: importing over a report that is in the archive asks first, then replaces it and brings it back.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/zip", () => ({ readManifest: async () => ({ id: "quote", name: "ใบเสนอราคา" }) }));

const { ImportDialog } = await import("@/components/ImportDialog");

describe("ImportDialog", () => {
  const fetchMock = vi.fn();
  const archived = () =>
    Response.json({ code: "TEMPLATE_ARCHIVED", title: "Archived", status: 409, detail: "archived" }, { status: 409 });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    push.mockReset();
  });

  async function pickAndSubmit() {
    vi.stubGlobal("fetch", fetchMock);
    HTMLDialogElement.prototype.showModal ??= vi.fn();
    HTMLDialogElement.prototype.close ??= vi.fn();
    render(<ImportDialog />);
    fireEvent.change(screen.getByLabelText(/ไฟล์ zip ที่ export จาก Jester/), {
      target: { files: [new File(["PK"], "quote.zip")] },
    });
    await screen.findByText(/รายงานในไฟล์:/);
    fireEvent.submit(document.querySelector("form")!); // jsdom would stop a click on the required file input
  }

  it("asks before replacing an archived report, then sends overwrite and unarchive", async () => {
    fetchMock.mockResolvedValueOnce(archived()).mockResolvedValueOnce(Response.json({ template: { id: "quote" } }));
    await pickAndSubmit();
    expect(await screen.findByText(/ถูก archive อยู่/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1); // nothing replaced yet
    expect((fetchMock.mock.calls[0][1].body as FormData).get("unarchive")).toBeNull();

    fireEvent.click(screen.getByText("ทับและเลิก archive"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/templates/quote"));
    const sent = fetchMock.mock.calls[1][1].body as FormData;
    expect([sent.get("overwrite"), sent.get("unarchive"), sent.get("templateId")]).toEqual(["1", "1", "quote"]);
  });

  it("'ใช้ id ใหม่' goes back to the id box without sending anything", async () => {
    fetchMock.mockResolvedValueOnce(archived());
    await pickAndSubmit();
    fireEvent.click(await screen.findByText("ใช้ id ใหม่"));
    expect(screen.queryByText(/ถูก archive อยู่/)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an id that exists and is not archived still asks the old question", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: "CONFLICT", title: "Conflict", status: 409, detail: "x" }, { status: 409 }));
    await pickAndSubmit();
    expect(await screen.findByText(/มีรายงาน id/)).toBeTruthy();
    expect(screen.queryByText("ทับและเลิก archive")).toBeNull();
  });
});
