import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ api: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: calls.api }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: calls.replace }),
  usePathname: () => "/",
}));
// client components that pull in server actions
vi.mock("@/lib/actions/templates", () => ({ setArchived: vi.fn(), duplicateTemplate: vi.fn(), chooseCatalogView: vi.fn(), createTemplate: vi.fn() }));
vi.mock("@/lib/actions/tags", () => ({
  listTagUse: vi.fn().mockResolvedValue([]),
  setTemplateTags: vi.fn(),
  setDocumentTags: vi.fn(),
  setTagColor: vi.fn(),
}));
vi.mock("@/components/CreateTemplate", () => ({ CreateTemplate: () => null }));
vi.mock("@/components/ImportDialog", () => ({ ImportDialog: () => null }));
vi.mock("@/components/ViewToggle", () => ({ ViewToggle: () => null }));

import CatalogPage from "@/app/(app)/page";
import { CatalogFilters } from "@/components/CatalogFilters";

const template = (id: string, name: string, tags: string[]) => ({
  id,
  name,
  publishedVersion: 1,
  latestVersion: 1,
  draftRevision: 1,
  draftChangedSincePublish: false,
  lastRun: null,
  updatedAt: "2026-11-20T10:00:00Z",
  archivedAt: null,
  archivedBy: null,
  tags,
});
const TEMPLATES = [
  template("quote", "ใบเสนอราคา", ["vip", "q4"]),
  template("invoice", "ใบแจ้งหนี้", ["vip"]),
  template("memo", "บันทึก", []),
];
const USES = [
  { tag: "vip", color: "red", templates: 2, documents: 9 },
  { tag: "q4", color: "teal", templates: 1, documents: 0 },
  { tag: "docs-only", color: "gray", templates: 0, documents: 4 },
];

beforeEach(() => {
  calls.api.mockImplementation(async (path: string) => (path.startsWith("/v1/tags") ? USES : TEMPLATES));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function page(search: Record<string, string | string[]> = {}) {
  render(await CatalogPage({ searchParams: Promise.resolve(search) }));
}
const rows = () => screen.getAllByRole("row").slice(1);

describe("catalog page", () => {
  it("shows each report's tags as chips in the table", async () => {
    await page();
    const quote = rows().find((r) => r.textContent?.includes("ใบเสนอราคา")) as HTMLElement;
    expect(within(quote).getByText("vip")).toBeTruthy();
    expect(within(quote).getByText("q4")).toBeTruthy();
    const memo = rows().find((r) => r.textContent?.includes("บันทึก")) as HTMLElement;
    expect(within(memo).queryByText("vip")).toBeNull();
  });

  it("?tag= keeps only reports that carry every tag given", async () => {
    await page({ tag: "vip" });
    expect(rows()).toHaveLength(2);
    cleanup();
    await page({ tag: ["vip", "q4"] });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("ใบเสนอราคา");
    cleanup();
    await page({ tag: "VIP" }); // exact match, like the api
    expect(screen.queryAllByRole("row")).toHaveLength(0);
  });

  it("the search box finds reports by tag too", async () => {
    await page({ q: "Q4" });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("ใบเสนอราคา");
  });

  it("offers the tags reports carry, not tags only documents carry", async () => {
    await page();
    const group = screen.getByRole("group", { name: /กรองด้วย tag/ });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["vip", "q4"]);
  });

  it("every report has a menu item to edit its tags", async () => {
    await page();
    expect(screen.getAllByRole("button", { name: "แก้ tag…", hidden: true })).toHaveLength(3);
  });
});

describe("CatalogFilters tags", () => {
  const options = [
    { tag: "vip", color: "red", count: 2 },
    { tag: "q4", color: "teal", count: 1 },
  ];
  const lastUrl = () => calls.replace.mock.calls.at(-1)?.[0] as string;

  it("a click chooses a tag at once and puts it in the URL; another narrows further", () => {
    render(<CatalogFilters q="" status="" archived={false} tags={[]} options={options} />);
    const vip = screen.getByRole("button", { name: "vip" });
    fireEvent.click(vip);
    expect(vip.getAttribute("aria-pressed")).toBe("true");
    expect(lastUrl()).toBe("/?tag=vip");
    fireEvent.click(screen.getByRole("button", { name: "q4" }));
    expect(lastUrl()).toBe("/?tag=vip&tag=q4");
  });

  it("clicking a chosen tag takes it off, and keeps the other filters", () => {
    render(<CatalogFilters q="ใบ" status="published" archived tags={["vip", "q4"]} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "vip" }));
    expect(lastUrl()).toBe("/?q=%E0%B9%83%E0%B8%9A&status=published&archived=1&tag=q4");
  });

  it("ล้าง tag clears them all", () => {
    render(<CatalogFilters q="" status="" archived={false} tags={["vip"]} options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "ล้าง tag" }));
    expect(lastUrl()).toBe("/");
    expect(screen.queryByRole("button", { name: "ล้าง tag" })).toBeNull();
  });

  it("no tag bar when nothing carries a tag", () => {
    render(<CatalogFilters q="" status="" archived={false} tags={[]} options={[]} />);
    expect(screen.queryByRole("group", { name: /tag/ })).toBeNull();
  });
});
