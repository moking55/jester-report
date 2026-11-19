import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PageSetupModal, pageFor } from "@/components/PageSetupModal";

beforeAll(() => {
  // jsdom has no <dialog> methods
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});
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

describe("PageSetupModal", () => {
  it("creates a free A5 landscape page from the cards and the size list", () => {
    const onConfirm = vi.fn();
    render(<PageSetupModal onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ }));
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "A5" } });
    fireEvent.click(screen.getByLabelText("แนวนอน"));
    fireEvent.click(screen.getByRole("button", { name: "สร้าง" }));
    expect(onConfirm).toHaveBeenCalledWith({ size: "A5", orientation: "landscape", layout: "free" }, "free");
  });

  it("a roll turns the free layout off, with the reason", () => {
    const onConfirm = vi.fn();
    render(<PageSetupModal onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ }));
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "roll80" } });
    expect(screen.getByRole("radio", { name: /จัดวางแบบอิสระ/ })).toHaveProperty("disabled", true);
    expect(screen.getByText(/ใบเสร็จม้วนใช้แบบอิสระไม่ได้/)).toBeTruthy();
    expect(screen.queryByLabelText("แนวนอน")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "สร้าง" }));
    expect(onConfirm).toHaveBeenCalledWith({ size: "roll", rollWidthMm: 80 }, "flow");
  });

  it("custom size outside the limits cannot be created", () => {
    render(<PageSetupModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("ขนาดกระดาษ"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("กว้าง (mm)"), { target: { value: "10" } });
    expect(screen.getByRole("button", { name: "สร้าง" })).toHaveProperty("disabled", true);
  });
});
