// Examples of a /v1/render request: the API page and the issue form's developer dialog.
// The key always comes from JESTER_API_KEY: Studio never shows a real secret here.

/** What another system would run in sh/bash. Headers go to the terminal; an error status exits non-zero. */
export function curlExample(body: string): string {
  const quoted = `'${body.replace(/'/g, `'\\''`)}'`; // safe inside single quotes in sh/bash
  return [
    'curl -X POST "$JESTER_API/v1/render" \\',
    '  -H "Authorization: Bearer $JESTER_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d ${quoted} \\`,
    "  -D - --fail-with-body \\",
    "  -o report.pdf",
  ].join("\n");
}

// The body stays the exact text (a JSON string literal is valid JS and Python), so long decimals keep every digit.

export function fetchExample(body: string): string {
  return [
    "// Node 18+ (ES module) or a browser behind your own server: never put the key in a web page",
    `const body = ${JSON.stringify(body)};`,
    "const response = await fetch(`${process.env.JESTER_API}/v1/render`, {",
    '  method: "POST",',
    "  headers: {",
    "    Authorization: `Bearer ${process.env.JESTER_API_KEY}`,",
    '    "Content-Type": "application/json",',
    "  },",
    "  body,",
    "});",
    "if (!response.ok) throw new Error(JSON.stringify(await response.json())); // problem+json: code, problems[].pointer",
    'console.log("run", response.headers.get("Jester-Run-Id"), "version", response.headers.get("Jester-Template-Version"));',
    'const { writeFile } = await import("node:fs/promises");',
    'await writeFile("report.pdf", Buffer.from(await response.arrayBuffer()));',
  ].join("\n");
}

export function pythonExample(body: string): string {
  return [
    "# Python 3, standard library only",
    "import json, os, urllib.error, urllib.request",
    "",
    `body = ${JSON.stringify(body)}`,
    "request = urllib.request.Request(",
    '    os.environ["JESTER_API"] + "/v1/render",',
    '    data=body.encode("utf-8"),',
    "    headers={",
    '        "Authorization": "Bearer " + os.environ["JESTER_API_KEY"],',
    '        "Content-Type": "application/json",',
    "    },",
    '    method="POST",',
    ")",
    "try:",
    "    with urllib.request.urlopen(request) as response:",
    '        print("run", response.headers["Jester-Run-Id"], "version", response.headers["Jester-Template-Version"])',
    '        with open("report.pdf", "wb") as f:',
    "            f.write(response.read())",
    "except urllib.error.HTTPError as e:",
    "    problem = json.load(e)  # problem+json: code, detail, problems[].pointer",
    "    raise SystemExit(json.dumps(problem, ensure_ascii=False, indent=2))",
  ].join("\n");
}
