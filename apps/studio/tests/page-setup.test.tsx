import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_PAGE, PageSetup, pageFor, pageOk } from "@/components/PageSetup";

afterEach(cleanup);

describe("pageFor", () => {
  const custom = { width: 100, height: 50 };
  it("A4 portrait flow is the default: nothing to write", () => {
    expect(pageFor("flow", "A4", "portrait", custom)).toBeNull();
  });
  it("other sheets, orientation and free layout", () => {
    expect(pageFor("flow", "A5", "landscape", custom)).toEqual({ size: "A5", orientation: "landscape" });
    expect(pageFor("free", "A4", "portrait", custom)).toEqual({ size: "A4", orientation: "portrait", layout: "free" });
  });
  it("a roll has its width only; custom brings margins that fit", () => {
    expect(pageFor("flow", "roll80", "portrait", custom)).toEqual({ size: "roll", rollWidthMm: 80 });
    expect(pageFor("flow", "custom", "portrait", custom)).toEqual({
      size: "custom",
      orientation: "portrait",
      widthMm: 100,
      heightMm: 50,
      marginsMm: { top: 15, bottom: 15, left: 15, right: 15 },
    });
    expect(pageFor("free", "custom", "portrait", custom)).toEqual({ size: "custom", orientation: "portrait", widthMm: 100, heightMm: 50, layout: "free" });
  });
});

describe("PageSetup", () => {
  // the modal keeps the choice; here a small parent does, and shows what would be sent
  function Harness() {
    const [v, setV] = useState(DEFAULT_PAGE);
    return (
      <>
        <PageSetup value={v} onChange={setV} />
        <output data-testid="out">{JSON.stringify({ page: pageFor(v.layout, v.choice, v.orientation, v), ok: pageOk(v) })}</output>
      </>
    );
  }
  const out = () => JSON.parse(screen.getByTestId("out").textContent!);

  it("a free A5 landscape page from the cards and the size list", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ }));
    expect(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /จัดวางแบบคงที่/ }).getAttribute("aria-checked")).toBe("false");
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "A5" } });
    fireEvent.click(screen.getByLabelText("แนวนอน"));
    expect(out()).toEqual({ page: { size: "A5", orientation: "landscape", layout: "free" }, ok: true });
  });

  it("a roll turns the free layout off, with the reason", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ }));
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "roll80" } });
    expect(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/ใบเสร็จม้วนใช้แบบอิสระไม่ได้/)).toBeTruthy();
    expect(screen.queryByLabelText("แนวนอน")).toBeNull();
    expect(out().page).toEqual({ size: "roll", rollWidthMm: 80 });
  });

  it("a custom size outside the limits is not ok", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("กว้าง (mm)"), { target: { value: "10" } });
    expect(out().ok).toBe(false);
    expect(screen.getByText(/กว้าง 25–1000 mm/)).toBeTruthy();
  });
});
