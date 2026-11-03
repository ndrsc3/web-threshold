import subprocess,sys,pathlib
C=sys.argv[1]; V=str(pathlib.Path(C,"node_modules/.bin/vitest"))
muts=[
("no-op","src/gate/sealed.ts",'const MEMORY_KEY','const MEMORY_KEY'),
("memory on by default","src/gate/sealed.ts",'if (this.getAttribute("remember") !== "session") return;',''),
("replay always","src/gate/sealed.ts",'else if (this.#remembers()) await this.#replay(bundle);','else await this.#replay(bundle);'),
("replay never","src/gate/sealed.ts",'else if (this.#remembers()) await this.#replay(bundle);',''),
("replayed flag dropped","src/gate/sealed.ts",'...(replayed ? { replayed } : {}),',''),
("flag always","src/gate/sealed.ts",'...(replayed ? { replayed } : {}),','replayed: true,'),
("wrong phrase stored","src/gate/sealed.ts",'''      if (record) {
        this.#keep(kek);''','''      this.#keep(kek);
      if (record) {'''),
("no dedupe","src/gate/sealed.ts",'const keys = new Set(this.#storedKeys()).add(toB64(kek));','const keys = [...this.#storedKeys(), toB64(kek)];'),
("storage read throws","src/gate/sealed.ts",'''    } catch {
      return [];
    }''','''    } catch (e) {
      throw e;
    }'''),
("storage write throws","src/gate/sealed.ts",'''    } catch {
      // Retyping is the fallback.
    }''','''    } catch (e) {
      throw e;
    }'''),
("junk entry throws","src/gate/sealed.ts",'''      } catch {
        // A damaged entry opens nothing.
      }''','''      } catch (e) {
        throw e;
      }'''),
("remember value unchecked","src/gate/sealed.ts",'if (value !== null) this.emitFault("unsupported-remember");',''),
("in place: page scanned","src/seal/scan.ts",'if (replaced.has(file)) return;',''),
("in place: no confine","src/seal/index.ts",'''      confine(out, payload.page!);
      inPlace.push''','''      inPlace.push'''),
("in place: path a target","src/seal/index.ts",'...pages.filter(([, payload]) => payload.from !== undefined).flatMap(','...pages.flatMap('),
("in place: from required off","src/seal/index.ts",'if (typeof payload.from !== "string" && !(payload.from === undefined && payload.page !== undefined)) {','if (false) {'),
("in place: not git checked","src/seal/index.ts",'sources.push(from);','if (payload.from !== undefined) sources.push(from);'),
("pages inline","src/seal/index.ts",'if (page === undefined && TEXT_TYPES.has(type)','if (TEXT_TYPES.has(type)'),
("remember value open","src/seal/index.ts",'if (file.remember !== undefined && file.remember !== "session") errors.push','if (false) errors.push'),
("remember not on shell","src/seal/index.ts",'options.element ?? "", file.remember)','options.element ?? "")'),
("exists check ignores from","src/seal/index.ts",'if (payload.from !== undefined && payload.page !== undefined && existsSync(join(out, payload.page))) {','if (false) {'),
]
for label,f,a,b in muts:
    p=pathlib.Path(C,f); o=p.read_text()
    if a not in o: print("MISSING",label); continue
    p.write_text(o.replace(a,b,1))
    r=subprocess.run([V,"run","--root",C,"--bail","1"],capture_output=True,text=True,cwd=C)
    print(("SURVIVED " if r.returncode==0 else "caught   ")+label,flush=True)
    p.write_text(o)
