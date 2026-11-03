import subprocess,sys,pathlib
C=sys.argv[1]; V=str(pathlib.Path(C,"node_modules/.bin/vitest"))
muts=[
("symlink page allowed","src/seal/index.ts",'if (lstatSync(join(out, target)).isSymbolicLink()) throw','if (false) throw'),
("shell as source allowed","src/seal/index.ts",'if (payload.page !== undefined && /<web-threshold','if (false && /<web-threshold'),
("no temp stage","src/seal/index.ts",'for (const { temp, target } of staged) renameSync(temp, target);','for (const { temp, target } of staged) { writeFileSync(target, readFileSync(temp)); rmSync(temp); }'),
("stage leaves temps","src/seal/index.ts",'''  } catch (err) {
    cleanUp();
    const { code, path }''','''  } catch (err) {
    const { code, path }'''),
("late listener deaf","src/gate/sealed.ts",'if (replayed) this.#replays.push(detail);',''),
("typed delivered late","src/gate/sealed.ts",'if (replayed) this.#replays.push(detail);','this.#replays.push(detail);'),
("object listener ignored","src/gate/sealed.ts",'else listener.handleEvent(event);',''),
]
for label,f,a,b in muts:
    p=pathlib.Path(C,f); o=p.read_text()
    if a not in o: print("MISSING",label); continue
    p.write_text(o.replace(a,b,1))
    r=subprocess.run([V,"run","--root",C,"--bail","1"],capture_output=True,text=True,cwd=C)
    print(("SURVIVED " if r.returncode==0 else "caught   ")+label,flush=True)
    p.write_text(o)
