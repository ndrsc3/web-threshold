import subprocess,sys,pathlib
C=sys.argv[1]; V=str(pathlib.Path(C,"node_modules/.bin/vitest"))
muts=[
("type case","src/seal/index.ts",'else payload.type = payload.type.toLowerCase();',''),
("readable narrow","src/seal/index.ts",'.filter(([name]) => isReadable(file.payloads[name]!.type))','.filter(([name]) => TEXT_TYPES.has(file.payloads[name]!.type))'),
("case pages","src/seal/index.ts",'seenPages.has(String(payload.page).toLowerCase())','seenPages.has(String(payload.page))'),
("allowPublic ignored","src/seal/scan.ts",'if (allow.has(folded) || (target.path','if ((target.path'),
("bundle not scanned","src/seal/index.ts",'staged: [{ file: BUNDLE_PATH, text: json }, ...','staged: [...'),
("read-back off","src/seal/index.ts",'await verifyBundle(parseBundle(JSON.parse(json)), file, contents, built.files);',''),
("plain falls back","src/gate/web-threshold.ts",'''    if (this.hasAttribute("sealed")) {
      this.emitFault("sealed-needs-sealed-entry"); // never falls back to plain secrets
      return;
    }
''',''),
("file cross-origin","src/gate/sealed.ts",'''    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new BundleError("cross-origin");''','''    const url = new URL(src, location.href);'''),
("unclosed style hides text","src/seal/scan.ts",'''    if (end === -1) break;
    out +=''','''    if (end === -1) return out;
    out +='''),
]
for label,f,a,b in muts:
    p=pathlib.Path(C,f); o=p.read_text()
    if a not in o: print("MISSING",label); continue
    p.write_text(o.replace(a,b,1))
    r=subprocess.run([V,"run","--root",C,"--bail","1"],capture_output=True,text=True,cwd=C)
    print(("SURVIVED " if r.returncode==0 else "caught   ")+label,flush=True)
    p.write_text(o)
