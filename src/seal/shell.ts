/** The public page that stands in for a sealed page: the element, the bundle and one small handler. */

export const SHELL_MARKER = "<!--web-threshold-->";

export const DEFAULT_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Enter</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; max-width: 34rem; margin: 0 auto; padding: 4rem 1rem; background: #fff; color: #222; }
      web-threshold[busy] { opacity: 0.5; }
    </style>
  </head>
  <body>
    ${SHELL_MARKER}
  </body>
</html>
`;

// Replacing the document keeps the sealed page's own scripts and styles working. It happens
// once: a second write would run the page's scripts twice, and top-level consts then throw.
export const HANDLER = `const gate = document.querySelector("web-threshold");
let opening = false;
gate.addEventListener("tier-unlocked", async ({ detail }) => {
  const name = gate.dataset.open;
  if (opening || !detail.names.includes(name)) return;
  opening = true;
  try {
    const html = await (await detail.open(name)).text();
    document.open();
    document.write(html);
    document.close();
  } catch {
    opening = false; // the element has emitted threshold-error, and the door can be tried again
  }
});`;

const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
// Nothing inside a script may read as its closing tag.
const inScript = (text: string) => text.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

export interface Shell {
  /** The file to write. */
  html: string;
  /** The same file without the element's own code, for the leak scan: its words aren't secrets. */
  publicText: string;
}

export function buildShell(template: string, bundlePath: string, payloadName: string, element: string): Shell {
  const parts = template.split(SHELL_MARKER);
  if (parts.length !== 2) throw new Error(`the shell must contain ${SHELL_MARKER} exactly once`);
  const gate = (code: string) =>
    [
      `<web-threshold sealed="${attr(bundlePath)}" data-open="${attr(payloadName)}" label="Enter the phrase" button="Enter"></web-threshold>`,
      `<script type="module">${code}</script>`,
      `<script type="module">${HANDLER}</script>`,
    ].join("\n");
  return {
    html: parts[0] + gate(inScript(element)) + parts[1],
    publicText: parts[0] + gate("") + parts[1],
  };
}
