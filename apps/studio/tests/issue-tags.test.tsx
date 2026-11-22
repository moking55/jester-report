import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/tags", () => ({ listTagUse: vi.fn().mockResolvedValue([]) }));

import { IssueForm } from "@/components/IssueForm";

const source = {
  version: 3,
  reportJson: '{"parameters":{}}',
  schemaJson: '{"type":"object","properties":{}}',
  tags: ["vip", "ไตรมาส 4"],
};

let sent: { template: unknown; tags?: string[] } | null = null;
const onPdf = vi.fn();

beforeEach(() => {
  sent = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(new Blob(["%PDF"]), { headers: { "content-disposition": 'attachment; filename="a.pdf"' } });
    }),
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const tagBox = () => screen.getByRole("combobox", { name: "tag ของเอกสาร" });
const issue = () => fireEvent.click(screen.getByRole("button", { name: "ออก PDF" }));

describe("issue form tags", () => {
  it("starts with the template's tags and sends them", async () => {
    render(<IssueForm templateId="quote" source={source} onPdf={onPdf} />);
    expect(screen.getByRole("button", { name: "ลบ tag vip" })).toBeTruthy();
    issue();
    await waitFor(() => expect(onPdf).toHaveBeenCalled());
    expect(sent?.tags).toEqual(["vip", "ไตรมาส 4"]);
  });

  it("the tags can be changed before issuing, and a tag still typed counts", async () => {
    render(<IssueForm templateId="quote" source={source} onPdf={onPdf} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ tag vip" }));
    fireEvent.change(tagBox(), { target: { value: "ลูกค้า-ก" } });
    issue();
    await waitFor(() => expect(onPdf).toHaveBeenCalled());
    expect(sent?.tags).toEqual(["ไตรมาส 4", "ลูกค้า-ก"]);
  });

  it("all tags removed sends an empty list, not the template's", async () => {
    render(<IssueForm templateId="quote" source={source} onPdf={onPdf} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ tag vip" }));
    fireEvent.click(screen.getByRole("button", { name: "ลบ tag ไตรมาส 4" }));
    issue();
    await waitFor(() => expect(onPdf).toHaveBeenCalled());
    expect(sent?.tags).toEqual([]);
  });

  it("a bad tag typed in the box stops the issue and says why", async () => {
    render(<IssueForm templateId="quote" source={source} onPdf={onPdf} />);
    fireEvent.change(tagBox(), { target: { value: "x".repeat(31) } });
    issue();
    expect((await screen.findAllByRole("alert")).map((a) => a.textContent).join(" ")).toContain("1–30");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ล้างฟอร์ม puts the template's tags back", () => {
    render(<IssueForm templateId="quote" source={source} onPdf={onPdf} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ tag vip" }));
    expect(screen.queryByRole("button", { name: "ลบ tag vip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ล้างฟอร์ม" }));
    expect(screen.getByRole("button", { name: "ลบ tag vip" })).toBeTruthy();
  });

  it("a template with no tags starts with none", async () => {
    render(<IssueForm templateId="quote" source={{ ...source, tags: undefined }} onPdf={onPdf} />);
    issue();
    await waitFor(() => expect(onPdf).toHaveBeenCalled());
    expect(sent?.tags).toEqual([]);
  });
});
