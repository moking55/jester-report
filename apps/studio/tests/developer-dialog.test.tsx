import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DeveloperDialog } from "@/components/DeveloperDialog";

const source = {
  version: 3,
  reportJson: JSON.stringify({ parameters: { docDate: { type: "date", required: true, title: "วันที่", description: "วันที่ในเอกสาร" } } }),
  schemaJson: JSON.stringify({
    type: "object",
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: { type: "object", required: ["qty"], properties: { qty: { type: "integer", title: "จำนวน" } } },
      },
    },
  }),
};
const body = '{"template":{"id":"q","version":"published"},"params":{"docDate":"2000-01-01"},"data":{"items":[{"qty":1}]}}';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", ""); // jsdom has no <dialog> behaviour
  };
});
afterEach(cleanup);

describe("DeveloperDialog (v1.12)", () => {
  it("switches between curl, JavaScript and Python of the same body", () => {
    render(<DeveloperDialog body={body} source={source} onClose={() => {}} />);
    expect(screen.getByLabelText("ตัวอย่าง curl").textContent).toContain("-D -");
    fireEvent.click(screen.getByRole("button", { name: "Python" }));
    expect(screen.getByLabelText("ตัวอย่าง Python").textContent).toContain("urllib.request");
    expect(screen.getByRole("button", { name: "คัดลอก Python" })).toBeTruthy();
  });

  it("lists the fields by pointer with the report's own text, and a 422 pointing at them", () => {
    render(<DeveloperDialog body={body} source={source} onClose={() => {}} />);
    expect(screen.getByText("/params/docDate")).toBeTruthy();
    expect(screen.getByText(/วันที่ในเอกสาร/)).toBeTruthy();
    expect(screen.getByText("/data/items/0/qty")).toBeTruthy();
    const problem = JSON.parse(screen.getByLabelText("ตัวอย่าง 422").textContent!);
    expect(problem.problems.map((p: { pointer: string }) => p.pointer)).toEqual(["/params/docDate", "/data"]); // items missing
  });
});
