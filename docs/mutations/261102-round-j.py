# Mutations for the pass -j and -k folds: each removes one fix, and a test must fail.
# Usage: python3 docs/mutations/261102-round-j.py <copy-of-the-tree>   (edits files in that tree; give it a copy)
# A target string that's gone exits 2, rather than printing MISSING and carrying on.
import pathlib, subprocess, sys

C = pathlib.Path(sys.argv[1]).resolve()
V = str(C / "node_modules/.bin/vitest")
S, I, G, H = "src/seal/scan.ts", "src/seal/index.ts", "src/gate/sealed.ts", "src/seal/shell.ts"
muts = [
    ("no-op control", S, "const RUN = 8;", "const RUN = 8;"),
    ("j-1 \\x not decoded", S, ".replace(/\\\\x([0-9a-fA-F]{2})/g,", ".replace(/\\\\xNEVER([0-9a-fA-F]{2})/g,"),
    ("j-1 \\u{} not decoded", S, ".replace(/\\\\u\\{([0-9a-fA-F]{1,6})\\}/g,", ".replace(/\\\\uNEVER\\{([0-9a-fA-F]{1,6})\\}/g,"),
    ("j-1 rsquo unknown", S, 'lsquo: "‘", rsquo: "’", ', 'lsquo: "‘", '),
    ("j-1 shy unknown", S, ' shy: "",', ""),
    ("j-1 accents unknown", S, " ?? ACCENTED.exec(name!)?.[1]", ""),
    ("j-1 payload side raw", S, "(decoded === text ? [text] : [text, decoded]).flatMap", "[text].flatMap"),
    ("k-1 invisible kept in files", S, 'this.folded = fold1(text.replace(INVISIBLE, ""));', "this.folded = fold1(text);"),
    ("j-2 by declared type", I, "const text = asText(bytes);", "const text = saysText(file.payloads[name]!.type) ? asText(bytes) : null;"),
    ("j-3 no hash after decompress", S, "if (packed) result", "if (false && packed) result"),
    ("j-10 names unchecked", S, 'check(`a file name in ${dirname(file) === "." ? "the top folder" : dirname(file)}`, file);', ""),
    ("k-2 name printed", S, 'check(`a file name in ${dirname(file) === "." ? "the top folder" : dirname(file)}`, file);', "check(`the name ${file}`, file);"),
    ("j-10 data keys skipped", I, "...(prose(key) ? [key] : []), ", ""),
    ("k-3 keys counted by spaces", I, "tokensOf(fold1(key)).length >= 3", 'fold1(key).split(" ").length >= 3'),
    ("j-13 empty targets kept", S, "if (!folded) return [];", ""),
    ("j-13 no clean URL", I, 'return [page, page.replace(/\\.html$/, "")];', "return [page];"),
    ("j-12 no script warning", I, "if (payload.page !== undefined && EXTERNAL_SCRIPT", "if (false && EXTERNAL_SCRIPT"),
    ("j-6 bundle written last", I, """    [BUNDLE_PATH, json],
    ...built.files,
    ...shells.map((shell): [string, string] => [shell.path, shell.html]),
""", """    ...built.files,
    ...shells.map((shell): [string, string] => [shell.path, shell.html]),
    [BUNDLE_PATH, json],
"""),
    ("j-6 temps kept on rename failure", I, """    cleanUp();
    throw new SealRefusal(`writing stopped""", """    throw new SealRefusal(`writing stopped"""),
    ("j-11 late event without target", G, 'for (const key of ["target", "currentTarget"]) Object.defineProperty(event, key, { value: this });', ""),
    ("k-5 payloads fetched eagerly", G, "    if (replayed) this.#replays.push(detail);",
     "    for (const n of Object.keys(record.open)) void detail.open(n).catch(() => {});\n    if (replayed) this.#replays.push(detail);"),
    ("noscript gone", H, "    <noscript>This page opens with a phrase, which needs JavaScript.</noscript>\n", ""),
]
survived = []
for label, f, a, b in muts:
    p = C / f
    o = p.read_text()
    if a not in o:
        print("MISSING ", label, flush=True)
        sys.exit(2)
    p.write_text(o.replace(a, b, 1))
    try:
        r = subprocess.run([V, "run", "--root", str(C), "--bail", "1"], capture_output=True, text=True, cwd=C)
    finally:
        p.write_text(o)
    if r.returncode == 0 and label != "no-op control":
        survived.append(label)
    print(("SURVIVED " if r.returncode == 0 else "caught   ") + label, flush=True)
sys.exit(1 if survived else 0)
