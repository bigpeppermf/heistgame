export const SENTINEL = '##HC##';

export const PY_HARNESS = `import io, json, sys, time, traceback, importlib.util, contextlib

SENTINEL = "${'##HC##'}"

# The real stdout is held here; the submission only ever sees a capture buffer.
REAL_STDOUT = sys.stdout
CAP_LIMIT = 65536

class Capture(io.StringIO):
    def write(self, s):
        room = CAP_LIMIT - self.tell()
        if room <= 0:
            return len(s)
        return super().write(s[:room])

_CAPTURED = []
_CAP_LEN = 0

def emit(obj):
    REAL_STDOUT.write(SENTINEL + json.dumps(obj, default=str) + "\\n")
    REAL_STDOUT.flush()

def run_captured(f, *args):
    global _CAP_LEN
    buf = Capture()
    try:
        with contextlib.redirect_stdout(buf):
            return f(*args)
    finally:
        text = buf.getvalue()
        room = CAP_LIMIT - _CAP_LEN
        if room > 0:
            _CAPTURED.append(text[:room])
            _CAP_LEN += len(text[:room])

def emit_stdout():
    emit({"stdout": "".join(_CAPTURED)})

def main():
    with open("config.json") as fh:
        cfg = json.load(fh)
    tests = cfg["tests"]
    try:
        spec = importlib.util.spec_from_file_location("solution", "solution.py")
        mod = importlib.util.module_from_spec(spec)
        run_captured(spec.loader.exec_module, mod)
        fn = getattr(mod, cfg["functionName"])
    except Exception:
        sys.stderr.write(traceback.format_exc())
        for i in range(len(tests)):
            emit({"i": i, "ms": 0, "actual": None, "error": "load_error"})
        emit_stdout()
        return
    for i, t in enumerate(tests):
        start = time.perf_counter()
        actual = None
        error = None
        try:
            actual = run_captured(fn, *t["input"])
        except Exception as e:
            error = type(e).__name__ + ": " + str(e)
        emit({"i": i, "ms": int((time.perf_counter() - start) * 1000), "actual": actual, "error": error})
    emit_stdout()

main()
`;

export const JS_HARNESS = `const fs = require('fs');
const SENTINEL = '${'##HC##'}';
// The real writer lives only in this closure; the submission gets capturing stubs.
const realWrite = process.stdout.write.bind(process.stdout);
function emit(o) { realWrite(SENTINEL + JSON.stringify(o) + '\\n'); }
const CAP_LIMIT = 65536;
let captured = '';
function capture(s) {
  if (captured.length < CAP_LIMIT) captured += String(s).slice(0, CAP_LIMIT - captured.length);
}
const fmt = require('util').format;
console.log = console.info = console.debug = function () { capture(fmt.apply(null, arguments) + '\\n'); };
process.stdout.write = function (s) { capture(typeof s === 'string' ? s : Buffer.from(s).toString('utf8')); return true; };
const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
let fn;
try {
  const mod = require('./solution.js');
  fn = (typeof mod === 'function') ? mod : mod[cfg.functionName];
  if (typeof fn !== 'function') throw new Error('missing function ' + cfg.functionName);
} catch (e) {
  process.stderr.write((e && e.stack) ? e.stack : String(e));
  for (let i = 0; i < cfg.tests.length; i++) emit({ i: i, ms: 0, actual: null, error: 'load_error' });
  emit({ stdout: captured });
  process.exit(0);
}
for (let i = 0; i < cfg.tests.length; i++) {
  const t0 = Date.now();
  let actual = null, error = null;
  try { actual = fn.apply(null, cfg.tests[i].input); }
  catch (e) { error = ((e && e.name) ? e.name + ': ' : '') + ((e && e.message) ? e.message : String(e)); }
  emit({ i: i, ms: Date.now() - t0, actual: actual === undefined ? null : actual, error: error });
}
emit({ stdout: captured });
`;
