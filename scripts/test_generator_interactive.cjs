const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

if (isMainThread) {
  // Main Thread: Simulates React IDE
  console.log('[IDE] Starting interactive generator worker test...');
  const worker = new Worker(__filename);

  const testCode = `
#include <stdio.h>

void hanoi(int n, char from, char to, char aux) {
    if (n == 1) {
        printf("Move disk 1 from %c to %c\\n", from, to);
        return;
    }
    hanoi(n - 1, from, aux, to);
    printf("Move disk %d from %c to %c\\n", n, from, to);
    hanoi(n - 1, aux, to, from);
}

int main() {
    int a, b;
    printf("Interactive addition test:\\n");
    printf("Enter first number (a): ");
    scanf("%d", &a);
    printf("Enter second number (b): ");
    scanf("%d", &b);
    printf("Result: %d + %d = %d\\n\\n", a, b, a + b);

    int disks;
    printf("Enter number of disks for Hanoi (recursion test): ");
    scanf("%d", &disks);
    printf("Solving Hanoi for %d disks:\\n", disks);
    hanoi(disks, 'A', 'C', 'B');

    return 0;
}
`;

  const inputSequence = ['12\n', '34\n', '3\n'];

  worker.on('message', msg => {
    if (msg.type === 'output') {
      process.stdout.write(msg.text);
    } else if (msg.type === 'stdin_request') {
      const nextInput = inputSequence.shift();
      console.log(`\n[IDE Terminal] Live input requested! User typed: ${nextInput.trim()}`);
      worker.postMessage({ type: 'stdin_response', text: nextInput });
    } else if (msg.type === 'done') {
      console.log('\n[IDE Terminal] Execution finished successfully with exit code:', msg.exitCode);
      process.exit(0);
    } else if (msg.type === 'error') {
      console.error('\n[IDE Terminal] Error:', msg.text);
      process.exit(1);
    }
  });

  worker.postMessage({ type: 'run', code: testCode });

} else {
  // Worker Thread
  const JSCPP = require('../what_you_did/node_modules/JSCPP');
  const rt_1 = require('../what_you_did/node_modules/JSCPP/lib/rt');
  const interpreter_1 = require('../what_you_did/node_modules/JSCPP/lib/interpreter');
  const ast = require('../what_you_did/node_modules/JSCPP/lib/ast');
  const preprocessor = require('../what_you_did/node_modules/JSCPP/lib/preprocessor');
  const PEGUtil = require('pegjs-util');
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

  let inputStream = '';

  function* ensureInput(regex) {
    while (!regex.test(inputStream)) {
      const fresh = yield { type: 'stdin_request' };
      if (typeof fresh === 'string') {
        inputStream += fresh;
      } else {
        break;
      }
    }
  }

  function* _consume_next_char() {
    while (inputStream.length === 0) {
      const fresh = yield { type: 'stdin_request' };
      if (typeof fresh === 'string') {
        inputStream += fresh;
      } else {
        throw new Error('EOF');
      }
    }
    const ch = inputStream[0];
    inputStream = inputStream.substr(1);
    return ch;
  }

  function* _consume_next_line() {
    while (inputStream.indexOf('\n') === -1) {
      const fresh = yield { type: 'stdin_request' };
      if (typeof fresh === 'string') {
        inputStream += fresh;
      } else {
        break;
      }
    }
    const nextBreak = inputStream.indexOf('\n');
    let retval = '';
    if (nextBreak > -1) {
      retval = inputStream.substr(0, nextBreak);
      inputStream = inputStream.replace(`${retval}\n`, '');
    } else {
      retval = inputStream;
      inputStream = '';
    }
    return retval;
  }

  function* _get_input(pre, next, match) {
    const replace = (pre ? pre : '') + `(${match})`;
    const re = new RegExp(replace);
    yield* ensureInput(re);
    let tmp = inputStream;
    const m = tmp.match(re);
    if (!m) return null;
    const result = m[1];
    inputStream = inputStream.substr(inputStream.indexOf(result)).replace(result, '');
    if (next) {
      inputStream = inputStream.replace(next, '');
    }
    return result;
  }

  function* _get_integer(pre, next) {
    const text = yield* _get_input(pre, next, '[-]?[A-Za-z0-9]+');
    if (!text) return null;
    if (text[0] === '0') {
      if (text[1] === 'x' || text[1] === 'X') {
        return parseInt(text.substr(2), 16);
      }
      return parseInt(text, 8);
    }
    return parseInt(text, 10);
  }

  function* _get_float(pre, next) {
    const text = yield* _get_input(pre, next, '[-]?[0-9]+[\\.]?[0-9]*');
    return text ? parseFloat(text) : null;
  }

  function* _get_string(pre, next) {
    return yield* _get_input(pre, next, '([^\\s]+)');
  }

  function* _deal_type(format) {
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
        return yield* _get_integer(pre, next);
      case '%f':
      case '%lf':
        return yield* _get_float(pre, next);
      case '%s':
        return yield* _get_string(pre, next);
      case '%c':
        return yield* _consume_next_char();
      default:
        return yield* _get_integer(pre, next);
    }
  }

  function _set_pointer_value(rt, pointer, value) {
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

  function* customScanf(rt, _this, pchar, ...args) {
    const format = rt.getStringFromCharArray(pchar);
    const re = /[^%]*%[A-Za-z][^%]*/g;
    const selectors = format.match(re) || [];
    for (let i = 0; i < selectors.length; i++) {
      const val = yield* _deal_type(selectors[i]);
      _set_pointer_value(rt, args[i], val);
    }
    return rt.val(rt.intTypeLiteral, selectors.length);
  }

  const customCstdio = {
    load(rt) {
      baseCstdio.load(rt);
      const char_pointer = rt.normalPointerType(rt.charTypeLiteral);
      overrideFunc(rt, 'global', 'scanf', [char_pointer, '?'], rt.intTypeLiteral, customScanf);
      overrideFunc(rt, 'global', 'getchar', [], rt.intTypeLiteral, function* (rt) {
        try {
          const ch = yield* _consume_next_char();
          return rt.val(rt.intTypeLiteral, ch.charCodeAt(0));
        } catch {
          return rt.val(rt.intTypeLiteral, -1);
        }
      });
      overrideFunc(rt, 'global', 'gets', [char_pointer], char_pointer, function* (rt, _this, charPtr) {
        const line = yield* _consume_next_line();
        const dest = charPtr.v.target;
        for (let i = 0; i < line.length; i++) {
          dest[i] = rt.val(rt.charTypeLiteral, line.charCodeAt(i));
        }
        dest[line.length] = rt.val(rt.charTypeLiteral, 0);
        return charPtr;
      });
    }
  };

  JSCPP.includes['cstdio'] = customCstdio;
  JSCPP.includes['stdio.h'] = customCstdio;

  let currentGen = null;
  let startTime = 0;
  const timeoutLimit = 60000;

  function runLoop(nextVal) {
    try {
      while (true) {
        const step = currentGen.next(nextVal);
        nextVal = undefined;

        if (step.done) {
          parentPort.postMessage({ type: 'done', exitCode: step.value?.v ?? 0 });
          currentGen = null;
          break;
        }

        if (step.value && step.value.type === 'stdin_request') {
          // Pause execution and notify IDE
          parentPort.postMessage({ type: 'stdin_request' });
          break;
        }

        if (Date.now() - startTime > timeoutLimit) {
          throw new Error('Time limit exceeded.');
        }
      }
    } catch (err) {
      currentGen = null;
      parentPort.postMessage({ type: 'error', text: err.message });
    }
  }

  parentPort.on('message', msg => {
    if (msg.type === 'run') {
      try {
        inputStream = msg.stdin || '';
        const _config = {
          stdio: {
            drain() {
              return inputStream;
            },
            write(s) {
              parentPort.postMessage({ type: 'output', text: s });
            }
          },
          includes: JSCPP.includes
        };

        const rt = new rt_1.CRuntime(_config);
        let parsedCode = preprocessor.parse(rt, msg.code);
        const result = PEGUtil.parse(ast, parsedCode);
        if (result.error != null) {
          throw new Error('ERROR: Parsing Failure:\n' + PEGUtil.errorMessage(result.error, true));
        }

        const interpreter = new interpreter_1.Interpreter(rt);
        const defGen = interpreter.run(result.ast, parsedCode);
        while (true) {
          const step = defGen.next();
          if (step.done) break;
        }

        currentGen = rt.getFunc('global', 'main', [])(rt, null);
        startTime = Date.now();
        runLoop();
      } catch (err) {
        parentPort.postMessage({ type: 'error', text: err.message });
      }
    } else if (msg.type === 'stdin_response') {
      if (currentGen) {
        runLoop(msg.text);
      }
    }
  });
}
