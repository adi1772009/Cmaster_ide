const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  // Main Thread: Simulates the React IDE Terminal
  console.log('[IDE] Starting interactive C execution test with Stream Object...');
  const sab = new SharedArrayBuffer(1024);
  const status = new Int32Array(sab, 0, 1);
  const length = new Int32Array(sab, 4, 1);
  const charBuffer = new Uint8Array(sab, 8, 1016);

  const worker = new Worker(__filename, {
    workerData: { sab }
  });

  const inputsQueue = ['4\n'];
  worker.on('message', msg => {
    if (msg.type === 'output') {
      process.stdout.write(msg.text);
    } else if (msg.type === 'stdin_request') {
      const nextInput = inputsQueue.shift() || '4\n';
      console.log(`\n[IDE] Real-time input requested! User typed: ${nextInput.trim()}`);
      const enc = Buffer.from(nextInput, 'utf8');
      length[0] = enc.length;
      charBuffer.set(enc);
      Atomics.store(status, 0, 1);
      Atomics.notify(status, 0, 1);
    } else if (msg.type === 'done') {
      console.log('\n[IDE] Program exited successfully with code:', msg.exitCode);
    } else if (msg.type === 'error') {
      console.error('\n[IDE] Error:', msg.text);
    }
  });

} else {
  // Worker Thread
  const { sab } = workerData;
  const status = new Int32Array(sab, 0, 1);
  const length = new Int32Array(sab, 4, 1);
  const charBuffer = new Uint8Array(sab, 8, 1016);

  const JSCPP = require('../what_you_did/node_modules/JSCPP');

  function requestInput() {
    parentPort.postMessage({ type: 'stdin_request' });
    Atomics.store(status, 0, 0);
    Atomics.wait(status, 0, 0);

    const len = length[0];
    const bytes = charBuffer.slice(0, len);
    const text = Buffer.from(bytes).toString('utf8');
    return text;
  }

  const baseCstdio = require('../what_you_did/node_modules/JSCPP/lib/includes/cstdio');

  function overrideFunc(rt, lt, name, args, retType, impl) {
    const ltsig = rt.getTypeSignature(lt);
    if (ltsig in rt.types) {
      const t = rt.types[ltsig].handlers;
      if (t[name]) {
        const sig = rt.makeParametersSignature(args);
        if (t[name].functions) delete t[name].functions[sig];
        if (t[name].reg) delete t[name].reg[sig];
      }
    }
    rt.regFunc(impl, lt, name, args, retType);
  }

  const customCstdio = {
    load(rt) {
      baseCstdio.load(rt);

      const char_pointer = rt.normalPointerType(rt.charTypeLiteral);
      const { stdio } = rt.config;
      let input_stream = (stdio && typeof stdio.drain === 'function' ? stdio.drain() : '') || '';

      function ensureInput(regex) {
        while (!regex.test(input_stream)) {
          const fresh = requestInput();
          if (!fresh || fresh.length === 0) break;
          input_stream += fresh;
        }
      }

      function _consume_next_char() {
        while (input_stream.length === 0) {
          const fresh = requestInput();
          if (!fresh || fresh.length === 0) throw new Error('EOF');
          input_stream += fresh;
        }
        const ch = input_stream[0];
        input_stream = input_stream.substr(1);
        return ch;
      }

      function _consume_next_line() {
        while (input_stream.indexOf('\n') === -1) {
          const fresh = requestInput();
          if (!fresh || fresh.length === 0) break;
          input_stream += fresh;
        }
        const nextBreak = input_stream.indexOf('\n');
        let retval = '';
        if (nextBreak > -1) {
          retval = input_stream.substr(0, nextBreak);
          input_stream = input_stream.replace(`${retval}\n`, '');
        } else {
          retval = input_stream;
          input_stream = '';
        }
        return retval;
      }

      function _get_input(pre, next, match, type) {
        const replace = (pre ? pre : '') + `(${match})`;
        const re = new RegExp(replace);
        ensureInput(re);
        let tmp = input_stream;
        const m = tmp.match(re);
        if (!m) return null;
        const result = m[1];
        input_stream = input_stream.substr(input_stream.indexOf(result)).replace(result, '');
        if (next) {
          input_stream = input_stream.replace(next, '');
        }
        return result;
      }

      function _get_integer(pre, next) {
        const text = _get_input(pre, next, '[-]?[A-Za-z0-9]+');
        if (!text) return null;
        if (text[0] === '0') {
          if (text[1] === 'x' || text[1] === 'X') {
            return parseInt(text.substr(2), 16);
          }
          return parseInt(text, 8);
        }
        return parseInt(text, 10);
      }

      function _get_float(pre, next) {
        const text = _get_input(pre, next, '[-]?[0-9]+[\\.]?[0-9]*');
        return parseFloat(text);
      }

      function _get_string(pre, next) {
        return _get_input(pre, next, '([^\\s]+)', 'STR');
      }

      function _get_char(pre, next) {
        return _consume_next_char();
      }

      function _deal_type(format) {
        const res = format.match(/%[A-Za-z]+/);
        if (!res) return null;
        const type = res[0];
        const res2 = format.match(/[^%]*/);
        const pre = res2 ? res2[0] : null;
        const next = format.substr(format.indexOf(type) + type.length);
        switch (type) {
          case '%d':
          case '%ld':
          case '%i':
          case '%u':
          case '%lu':
          case '%llu':
            return _get_integer(pre, next);
          case '%f':
          case '%lf':
            return _get_float(pre, next);
          case '%s':
            return _get_string(pre, next);
          case '%c':
            return _get_char(pre, next);
          default:
            return _get_integer(pre, next);
        }
      }

      function _set_pointer_value(pointer, value) {
        if (!pointer || !pointer.v) return;
        if (rt.isNormalPointerType(pointer)) {
          if (rt.isNumericType(pointer.t.targetType)) {
            const nv = rt.val(pointer.t.targetType, value, true);
            pointer.v.target.v = nv.v;
          } else {
            const chCode = typeof value === 'string' ? value.charCodeAt(0) : value;
            const nv = rt.val(pointer.t.targetType, chCode, true);
            pointer.v.target.v = nv.v;
          }
        } else if (rt.isArrayType(pointer)) {
          if (rt.isNumericType(pointer.t.eleType)) {
            const nv = rt.val(pointer.t.eleType, value, true);
            const pos = pointer.v.position || 0;
            pointer.v.target[pos] = nv;
          } else {
            const str = String(value || '');
            const srcArray = rt.makeCharArrayFromString(str);
            const pos = pointer.v.position || 0;
            for (let i = 0; i < srcArray.v.target.length; i++) {
              pointer.v.target[pos + i] = srcArray.v.target[i];
            }
            if (pos + srcArray.v.target.length < pointer.v.target.length) {
              pointer.v.target[pos + srcArray.v.target.length] = rt.val(rt.charTypeLiteral, 0);
            }
          }
        }
      }

      function __scanf(format) {
        const re = /[^%]*%[A-Za-z][^%]*/g;
        const selectors = format.match(re) || [];
        return Array.from(selectors).map(val => _deal_type(val));
      }

      function _scanf(rt, _this, pchar, ...args) {
        const format = rt.getStringFromCharArray(pchar);
        const matched = __scanf(format);
        for (let i = 0; i < matched.length; i++) {
          _set_pointer_value(args[i], matched[i]);
        }
        return rt.val(rt.intTypeLiteral, matched.length);
      }

      // Register custom scanf, getchar, gets with our interactive implementations!
      overrideFunc(rt, 'global', 'scanf', [char_pointer, '?'], rt.intTypeLiteral, _scanf);
      overrideFunc(rt, 'global', 'getchar', [], rt.intTypeLiteral, (rt) => {
        try {
          const ch = _consume_next_char();
          return rt.val(rt.intTypeLiteral, ch.charCodeAt(0));
        } catch {
          return rt.val(rt.intTypeLiteral, -1);
        }
      });

      overrideFunc(rt, 'global', 'gets', [char_pointer], char_pointer, (rt, _this, charPtr) => {
        const line = _consume_next_line();
        const dest = charPtr.v.target;
        for (let i = 0; i < line.length; i++) {
          dest[i] = rt.val(rt.charTypeLiteral, line.charCodeAt(i));
        }
        dest[line.length] = rt.val(rt.charTypeLiteral, 0);
        return charPtr;
      });
    }
  };

  const testCode = `
#include <stdio.h>

int board[10][10];

int isSafe(int row, int col, int n) {
    for (int i = 0; i < col; i++)
        if (board[row][i]) return 0;
    for (int i = row, j = col; i >= 0 && j >= 0; i--, j--)
        if (board[i][j]) return 0;
    for (int i = row, j = col; j >= 0 && i < n; i++, j--)
        if (board[i][j]) return 0;
    return 1;
}

int solveNQUtil(int col, int n) {
    if (col >= n) return 1;
    for (int i = 0; i < n; i++) {
        if (isSafe(i, col, n)) {
            board[i][col] = 1;
            if (solveNQUtil(col + 1, n)) return 1;
            board[i][col] = 0; // BACKTRACK
        }
    }
    return 0;
}

int main() {
    int n;
    printf("Enter N for N-Queens puzzle: ");
    scanf("%d", &n);
    if (n > 10) n = 10;

    for (int i = 0; i < n; i++)
        for (int j = 0; j < n; j++)
            board[i][j] = 0;

    if (solveNQUtil(0, n) == 0) {
        printf("Solution does not exist\\n");
        return 0;
    }

    printf("Solution for %d-Queens:\\n", n);
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            printf("%s ", board[i][j] ? "Q" : ".");
        }
        printf("\\n");
    }
    return 0;
}
`;

  try {
    // Override cstdio in JSCPP
    JSCPP.includes['cstdio'] = customCstdio;
    JSCPP.includes['stdio.h'] = customCstdio;

    const exitCode = JSCPP.run(testCode, '', {
      stdio: {
        write: s => parentPort.postMessage({ type: 'output', text: s })
      },
      maxTimeout: 60000
    });
    parentPort.postMessage({ type: 'done', exitCode });
  } catch (err) {
    parentPort.postMessage({ type: 'error', text: err.stack || err.message });
  }
}


