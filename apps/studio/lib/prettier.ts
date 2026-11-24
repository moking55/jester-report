// Shift+Alt+F in the code editor (Shift+Option+F on a Mac): prettier, loaded on first use so it costs nothing until then.
// Jinja tags are masked, so even {% %} inside a tag (<td {% if x %}class="a"{% endif %}>) is formatted: every tag comes
// back exactly, though prettier may add a space or line break between attributes. A file prettier cannot parse
// (broken JSON or HTML) makes it throw; the editor then leaves the file alone.

const JINJA = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g;

export async function formatFile(name: string, text: string): Promise<string> {
  const [prettier, html, postcss, babel, estree] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/html"),
    import("prettier/plugins/postcss"),
    import("prettier/plugins/babel"),
    import("prettier/plugins/estree"),
  ]);
  // json-stringify: the layout of JSON.stringify(…, 2) and number text kept as written ("json" turns 1.10 into 1.1)
  const parser = name.endsWith(".json") ? "json-stringify" : name.endsWith(".css") ? "css" : "html";
  // each Jinja tag becomes one word prettier cannot wrap inside, and comes back exactly as written
  if (parser === "html" && /jinja\d+x/.test(text)) throw new Error("text already holds a placeholder word");
  const tags: string[] = [];
  const masked = parser === "html" ? text.replace(JINJA, (t) => `jinja${tags.push(t) - 1}x`) : text;
  const out = await prettier.format(masked, {
    parser,
    plugins: [html, postcss, babel, estree],
    printWidth: 120,
    htmlWhitespaceSensitivity: "css", // never adds or removes whitespace that would show on the page
  });
  return parser === "html" ? out.replace(/jinja(\d+)x/g, (_, i: string) => tags[Number(i)]) : out;
}
