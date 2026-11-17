// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readManifest } from "@/lib/zip";

// written by Python's zipfile: report.json + jester.json {"id": "quote", "name": "ใบเสนอราคา"}
const DEFLATED =
  "UEsDBBQAAAAIAK4ycl1Dv6ajBAAAAAIAAAALAAAAcmVwb3J0Lmpzb26rrgUAUEsDBBQAAAAIAK4ycl2Pn4R/TAAAAE0AAAALAAAAamVzdGVyLmpzb26rVkrLL8pNLAlLLSrOzM9TslIw1FFQykwBMpQKS/NLUpWA3LzE3FSQwIOdzQ92zHqws+HBjlUPdsx8sGPtgx2LH+zY9GBHC5BUqgUAUEsBAhQAFAAAAAgArjJyXUO/pqMEAAAAAgAAAAsAAAAAAAAAAAAAAIABAAAAAHJlcG9ydC5qc29uUEsBAhQAFAAAAAgArjJyXY+fhH9MAAAATQAAAAsAAAAAAAAAAAAAAIABLQAAAGplc3Rlci5qc29uUEsFBgAAAAACAAIAcgAAAKIAAAAAAA==";
const STORED =
  "UEsDBBQAAAAAAK4ycl1Dv6ajAgAAAAIAAAALAAAAcmVwb3J0Lmpzb257fVBLAwQUAAAAAACuMnJdj5+Ef00AAABNAAAACwAAAGplc3Rlci5qc29ueyJmb3JtYXRWZXJzaW9uIjogMSwgImlkIjogInF1b3RlIiwgIm5hbWUiOiAi4LmD4Lia4LmA4Liq4LiZ4Lit4Lij4Liy4LiE4LiyIn1QSwECFAAUAAAAAACuMnJdQ7+mowIAAAACAAAACwAAAAAAAAAAAAAAgAEAAAAAcmVwb3J0Lmpzb25QSwECFAAUAAAAAACuMnJdj5+Ef00AAABNAAAACwAAAAAAAAAAAAAAgAErAAAAamVzdGVyLmpzb25QSwUGAAAAAAIAAgByAAAAoQAAAAAA";
const NO_MANIFEST =
  "UEsDBBQAAAAAAK4ycl1Dv6ajAgAAAAIAAAALAAAAcmVwb3J0Lmpzb257fVBLAQIUABQAAAAAAK4ycl1Dv6ajAgAAAAIAAAALAAAAAAAAAAAAAACAAQAAAAByZXBvcnQuanNvblBLBQYAAAAAAQABADkAAAArAAAAAAA=";

const blob = (base64: string) => new Blob([Buffer.from(base64, "base64")]);

describe("readManifest", () => {
  it("reads a deflated or stored jester.json", async () => {
    expect(await readManifest(blob(DEFLATED))).toEqual({ id: "quote", name: "ใบเสนอราคา" });
    expect(await readManifest(blob(STORED))).toEqual({ id: "quote", name: "ใบเสนอราคา" });
  });

  it("is null for a zip without a manifest or a file that is not a zip", async () => {
    expect(await readManifest(blob(NO_MANIFEST))).toBeNull();
    expect(await readManifest(new Blob(["not a zip at all, just text"]))).toBeNull();
    expect(await readManifest(new Blob([]))).toBeNull();
  });
});
