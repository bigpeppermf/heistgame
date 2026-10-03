export const SENTINEL = '##HC##';

export const PY_HARNESS = `import json, sys, time, traceback, importlib.util

SENTINEL = "${'##HC##'}"

def emit(obj):
    sys.stdout.write(SENTINEL + json.dumps(obj, default=str) + "\\n")
    sys.stdout.flush()

def main():
    with open("config.json") as fh:
        cfg = json.load(fh)
    tests = cfg["tests"]
    try:
        spec = importlib.util.spec_from_file_location("solution", "solution.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        fn = getattr(mod, cfg["functionName"])
    except Exception:
        sys.stderr.write(traceback.format_exc())
        for i in range(len(tests)):
            emit({"i": i, "ms": 0, "actual": None, "error": "load_error"})
        return
    for i, t in enumerate(tests):
        start = time.perf_counter()
        actual = None
        error = None
        try:
            actual = fn(*t["input"])
        except Exception as e:
            error = type(e).__name__ + ": " + str(e)
        emit({"i": i, "ms": int((time.perf_counter() - start) * 1000), "actual": actual, "error": error})

main()
`;

export const JS_HARNESS = `const fs = require('fs');
const SENTINEL = '${'##HC##'}';
function emit(o) { process.stdout.write(SENTINEL + JSON.stringify(o) + '\\n'); }
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
let fn;
try {
  const mod = require('./solution.js');
  fn = (typeof mod === 'function') ? mod : mod[cfg.functionName];
  if (typeof fn !== 'function') throw new Error('missing function ' + cfg.functionName);
} catch (e) {
  process.stderr.write((e && e.stack) ? e.stack : String(e));
  for (let i = 0; i < cfg.tests.length; i++) emit({ i: i, ms: 0, actual: null, error: 'load_error' });
  process.exit(0);
}
for (let i = 0; i < cfg.tests.length; i++) {
  const t0 = Date.now();
  let actual = null, error = null;
  try { actual = fn.apply(null, cfg.tests[i].input); }
  catch (e) { error = ((e && e.name) ? e.name + ': ' : '') + ((e && e.message) ? e.message : String(e)); }
  emit({ i: i, ms: Date.now() - t0, actual: actual === undefined ? null : actual, error: error });
}
`;
