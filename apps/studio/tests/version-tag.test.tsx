// The version a person reads on the login page and in the footer's bottom-left.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import pkg from "@/package.json";
import { VersionTag } from "@/components/VersionTag";

afterEach(cleanup);

describe("VersionTag", () => {
  it("shows this Studio's release (package.json) and the api's", () => {
    render(<VersionTag api="1.14.0" />);
    expect(screen.getByTitle("เวอร์ชันของระบบ").textContent).toBe(`Studio ${pkg.version} · API 1.14.0`);
  });

  it("an api that cannot be reached, or sends no version, shows ?", () => {
    const { rerender } = render(<VersionTag api={undefined} />);
    expect(screen.getByTitle("เวอร์ชันของระบบ").textContent).toBe(`Studio ${pkg.version} · API ?`);
    rerender(<VersionTag api={null} />);
    expect(screen.getByTitle("เวอร์ชันของระบบ").textContent).toContain("API ?");
  });

  it("is a release number", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
