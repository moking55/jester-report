import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  listTagUse: vi.fn(),
  setTemplateTags: vi.fn(),
  setDocumentTags: vi.fn(),
  setTagColor: vi.fn(),
}));
vi.mock("@/lib/actions/tags", () => actions);

import { TagChip, TagChips } from "@/components/TagChip";
import { TagEditor } from "@/components/TagEditor";
import { TagField } from "@/components/TagField";

beforeEach(() => {
  actions.listTagUse.mockResolvedValue([
    { tag: "vip", color: "red", templates: 2, documents: 5 },
    { tag: "q4", color: "gray", templates: 1, documents: 0 },
  ]);
  actions.setTemplateTags.mockImplementation(async (_: string, tags: string[]) => ({ ok: true, tags }));
  actions.setDocumentTags.mockImplementation(async (_: string, tags: string[]) => ({ ok: true, tags }));
  actions.setTagColor.mockResolvedValue({ ok: true });
  // jsdom has no <dialog> behaviour
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close")); // what a browser does; the dialog unmounts its form on it
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Harness({ initial = [] as string[], colors = {} as Record<string, string>, onColor = undefined as undefined | ((t: string, c: string) => void) }) {
  const [value, setValue] = useState(initial);
  const [typed, setTyped] = useState("");
  return (
    <>
      <TagField value={value} onChange={setValue} typed={typed} onTyped={setTyped} colors={colors} onColor={onColor} />
      <output data-testid="out">{JSON.stringify(value)}</output>
    </>
  );
}
const out = () => JSON.parse(screen.getByTestId("out").textContent ?? "[]") as string[];
const box = () => screen.getByRole("combobox", { name: "tag" });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

describe("TagChip", () => {
  it("is the name as text with its colour in one custom property", () => {
    render(<TagChip tag="ลูกค้า-ก" color="red" />);
    const chip = screen.getByText("ลูกค้า-ก").parentElement as HTMLElement;
    expect(chip.style.getPropertyValue("--tag-base")).toBe("#c0392b");
  });
  it("an unknown colour is gray", () => {
    render(<TagChip tag="x" color="nope" />);
    expect((screen.getByText("x").parentElement as HTMLElement).style.getPropertyValue("--tag-base")).toBe("#64748b");
  });
  it("TagChips shows nothing for an empty set and keeps the order", () => {
    const { container, rerender } = render(<TagChips tags={[]} colors={{}} />);
    expect(container.textContent).toBe("");
    rerender(<TagChips tags={["b", "a"]} colors={{ a: "teal" }} />);
    expect(container.textContent).toBe("ba");
  });
});

describe("TagField", () => {
  it("Enter adds a tag, trimmed", () => {
    render(<Harness />);
    type("  ลูกค้า-ก ");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(out()).toEqual(["ลูกค้า-ก"]);
    expect((box() as HTMLInputElement).value).toBe("");
  });

  it("a comma ends a tag, also in pasted text", () => {
    render(<Harness />);
    type("a,b, c");
    expect(out()).toEqual(["a", "b"]);
    expect((box() as HTMLInputElement).value).toBe(" c");
  });

  it("Backspace on an empty box removes the last tag; on a typed box it only deletes text", () => {
    render(<Harness initial={["a", "b"]} />);
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(out()).toEqual(["a"]);
    type("x");
    fireEvent.keyDown(box(), { key: "Backspace" });
    expect(out()).toEqual(["a"]);
  });

  it("× removes that tag", () => {
    render(<Harness initial={["a", "b", "c"]} />);
    fireEvent.click(screen.getByRole("button", { name: "ลบ tag b" }));
    expect(out()).toEqual(["a", "c"]);
  });

  it("says why at the box and keeps what was typed", () => {
    render(<Harness initial={["a"]} />);
    type("x".repeat(31));
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("1–30");
    expect(box().getAttribute("aria-invalid")).toBe("true");
    expect(out()).toEqual(["a"]);
    expect((box() as HTMLInputElement).value).toBe("x".repeat(31));
  });

  it("will not take an eleventh tag", () => {
    render(<Harness initial={Array.from({ length: 10 }, (_, i) => `t${i}`)} />);
    type("more");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("ไม่เกิน 10");
    expect(out()).toHaveLength(10);
    expect(screen.getByText("10/10")).toBeTruthy();
  });

  it("offers the tags already in use (not the ones already chosen) once the box is used", async () => {
    const { container } = render(<Harness initial={["vip"]} />);
    fireEvent.focus(box());
    await waitFor(() => expect(container.querySelectorAll("datalist option")).toHaveLength(1));
    expect(container.querySelector("datalist option")?.getAttribute("value")).toBe("q4");
    fireEvent.blur(box());
    fireEvent.focus(box());
    expect(actions.listTagUse).toHaveBeenCalledTimes(1);
  });

  it("without onColor the chips are labels; with it the name opens nine colours", () => {
    const { rerender } = render(<Harness initial={["vip"]} />);
    expect(screen.queryByRole("button", { name: "สีของ vip" })).toBeNull();
    const onColor = vi.fn();
    rerender(<Harness initial={["vip"]} colors={{ vip: "red" }} onColor={onColor} />);
    fireEvent.click(screen.getByRole("button", { name: "สีของ vip" }));
    const group = screen.getByRole("group", { name: /สีของ “vip”/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(9);
    expect((within(group).getByRole("radio", { name: "แดง" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(group).getByRole("radio", { name: "น้ำเงิน" }));
    expect(onColor).toHaveBeenCalledWith("vip", "blue");
  });
});

describe("TagEditor", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "แก้ tag…" }));
  const dialog = () => screen.getByRole("dialog", { hidden: true });

  it("saves a template's tags, including what is still typed, and closes", async () => {
    render(<TagEditor kind="template" id="quote" name="ใบเสนอราคา" tags={["vip"]} />);
    open();
    fireEvent.change(within(dialog()).getByRole("combobox", { name: "tag", hidden: true }), { target: { value: "q4" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "บันทึก", hidden: true }));
    await waitFor(() => expect(actions.setTemplateTags).toHaveBeenCalledWith("quote", ["vip", "q4"]));
    await waitFor(() => expect(dialog().hasAttribute("open")).toBe(false));
  });

  it("a document goes to the document action", async () => {
    render(<TagEditor kind="document" id="0123456789ab0123456789" name="Q-1.pdf" tags={[]} />);
    open();
    fireEvent.click(within(dialog()).getByRole("button", { name: "บันทึก", hidden: true }));
    await waitFor(() => expect(actions.setDocumentTags).toHaveBeenCalledWith("0123456789ab0123456789", []));
    expect(actions.setTemplateTags).not.toHaveBeenCalled();
  });

  it("shows the api's reason and stays open", async () => {
    actions.setTemplateTags.mockResolvedValue({ ok: false, error: "บันทึกไม่ได้" });
    render(<TagEditor kind="template" id="quote" name="Q" tags={["a"]} />);
    open();
    fireEvent.click(within(dialog()).getByRole("button", { name: "บันทึก", hidden: true }));
    expect((await screen.findByText("บันทึกไม่ได้", { selector: "p" })).getAttribute("role")).toBe("alert");
    expect(dialog().hasAttribute("open")).toBe(true);
  });

  it("a bad tag still typed is refused before anything is sent", () => {
    render(<TagEditor kind="template" id="quote" name="Q" tags={[]} />);
    open();
    fireEvent.change(within(dialog()).getByRole("combobox", { name: "tag", hidden: true }), { target: { value: "x".repeat(31) } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "บันทึก", hidden: true }));
    expect(within(dialog()).getByRole("alert", { hidden: true }).textContent).toContain("1–30");
    expect(actions.setTemplateTags).not.toHaveBeenCalled();
  });

  it("picking a colour is saved for the tag name at once, even before the dialog is saved", async () => {
    render(<TagEditor kind="template" id="quote" name="Q" tags={["vip"]} />);
    open();
    await waitFor(() => expect(actions.listTagUse).toHaveBeenCalled());
    fireEvent.click(within(dialog()).getByRole("button", { name: "สีของ vip", hidden: true }));
    fireEvent.click(within(dialog()).getByRole("radio", { name: "เขียว", hidden: true }));
    await waitFor(() => expect(actions.setTagColor).toHaveBeenCalledWith("vip", "green"));
  });

  it("opening again starts from the saved tags, not from what was typed and cancelled", () => {
    render(<TagEditor kind="template" id="quote" name="Q" tags={["vip"]} />);
    open();
    fireEvent.click(within(dialog()).getByRole("button", { name: "ลบ tag vip", hidden: true }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "ยกเลิก", hidden: true }));
    open();
    expect(within(dialog()).getByRole("button", { name: "ลบ tag vip", hidden: true })).toBeTruthy();
  });
});
