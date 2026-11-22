import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: calls.api }));
vi.mock("@/lib/actions/tags", () => ({
  listTagUse: vi.fn().mockResolvedValue([]),
  setTemplateTags: vi.fn(),
  setDocumentTags: vi.fn(),
  setTagColor: vi.fn(),
}));

import DocumentsPage from "@/app/(app)/documents/page";

const RUN_A = "0123456789ab0123456789";
const RUN_B = "0123456789ab0123456788";
const doc = (runId: string, tags: string[]) => ({
  runId,
  createdAt: "2026-11-20T10:00:00Z",
  templateId: "quote",
  version: 1,
  caller: { type: "user", id: "u", name: "alice" },
  filename: `${runId.slice(-1)}.pdf`,
  pages: 1,
  params: {},
  tags,
});
const USES = [
  { tag: "vip", color: "red", templates: 1, documents: 7 },
  { tag: "q4", color: "teal", templates: 0, documents: 2 },
  { tag: "template-only", color: "gray", templates: 3, documents: 0 },
];

let documents: { items: ReturnType<typeof doc>[]; next: string | null };
beforeEach(() => {
  documents = { items: [doc(RUN_A, ["vip", "q4"]), doc(RUN_B, [])], next: null };
  calls.api.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/documents")) return documents;
    if (path.startsWith("/v1/templates/")) return { files: [] };
    if (path === "/v1/templates") return [{ id: "quote", name: "ใบเสนอราคา" }];
    if (path === "/v1/runs/retention") return { days: null };
    if (path === "/v1/tags") return USES;
    throw new Error(`unexpected ${path}`);
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function page(search: Record<string, string | string[]> = {}) {
  render(await DocumentsPage({ searchParams: Promise.resolve(search) }));
}
const documentsCall = () => String(calls.api.mock.calls.map((c) => c[0]).find((p: string) => p.startsWith("/v1/documents")));

describe("documents page tags", () => {
  it("shows each document's tags as chips", async () => {
    await page();
    const row = screen.getByText("8.pdf").closest("div") as HTMLElement;
    expect(within(row).queryByText("vip")).toBeNull();
    const withTags = screen.getByText("9.pdf").closest("div") as HTMLElement;
    expect(within(withTags).getByText("vip")).toBeTruthy();
    expect(within(withTags).getByText("q4")).toBeTruthy();
  });

  it("every document has its own edit-tags button", async () => {
    await page();
    expect(screen.getAllByRole("button", { name: "แก้ tag", hidden: true })).toHaveLength(2);
  });

  it("filters by the tags in the URL: one tag= each, sent to the api", async () => {
    await page({ tag: ["vip", "q4"] });
    const query = new URLSearchParams(documentsCall().split("?")[1]);
    expect(query.getAll("tag")).toEqual(["vip", "q4"]);
  });

  it("a checkbox per tag that documents carry (not tags only reports carry), the chosen ones checked", async () => {
    await page({ tag: "vip" });
    const box = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(box.map((b) => b.value)).toEqual(["vip", "q4"]);
    expect(box.map((b) => b.checked)).toEqual([true, false]);
    expect(box.every((b) => b.name === "tag")).toBe(true); // a plain GET form: ?tag=vip&tag=q4
  });

  it("the next-page link keeps every filter, several tags included", async () => {
    documents = { items: [doc(RUN_A, ["vip"])], next: RUN_A };
    await page({ template: "quote", q: "abc", tag: ["vip", "q4"] });
    const href = (screen.getByRole("link", { name: /หน้าถัดไป/ }) as HTMLAnchorElement).getAttribute("href") as string;
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("template")).toBe("quote");
    expect(params.get("q")).toBe("abc");
    expect(params.getAll("tag")).toEqual(["vip", "q4"]);
    expect(params.get("before")).toBe(RUN_A);
  });

  it("says which tag matched nothing", async () => {
    documents = { items: [], next: null };
    await page({ tag: "vip" });
    expect(document.body.textContent).toContain("ไม่พบเอกสารที่ตรงกับ tag vip");
  });
});
