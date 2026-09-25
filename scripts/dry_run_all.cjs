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

function safeFormat(fmt, args) {
  let argIdx = 0;
  return fmt.replace(/%(-?\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (match, width, prec, spec) => {
    if (spec === '%') return '%';
    if (argIdx >= args.length) return match;
    const val = args[argIdx++];
    let str = '';
    switch (spec) {
      case 'd':
      case 'i':
      case 'ld':
      case 'lld':
        str = String(parseInt(val, 10) || 0);
        break;
      case 'u':
      case 'lu':
      case 'llu':
        str = String(Math.max(0, parseInt(val, 10) || 0));
        break;
      case 'x':
        str = (parseInt(val, 10) || 0).toString(16);
        break;
      case 'X':
        str = (parseInt(val, 10) || 0).toString(16).toUpperCase();
        break;
      case 'o':
        str = (parseInt(val, 10) || 0).toString(8);
        break;
      case 'f':
      case 'lf': {
        const p = prec !== undefined ? parseInt(prec, 10) : 6;
        str = (parseFloat(val) || 0).toFixed(p);
        break;
      }
      case 'g':
      case 'e':
      case 'E': {
        str = String(parseFloat(val) || 0);
        break;
      }
      case 'c':
        str = typeof val === 'number' ? String.fromCharCode(val) : String(val);
        break;
      case 's':
        str = String(val !== undefined && val !== null ? val : '');
        break;
      case 'p':
        str = '0x' + (parseInt(val, 10) || 0).toString(16);
        break;
      default:
        str = String(val);
    }
    if (width) {
      const w = parseInt(width, 10);
      if (w > 0) {
        str = str.padStart(w, ' ');
      } else if (w < 0) {
        str = str.padEnd(-w, ' ');
      }
    }
    return str;
  });
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
    const { stdio } = rt.config;

    const _strcpy = (rt, _this, [target, src]) => {
      const dest = target.v.target;
      const srcArr = src.v.target;
      const destPos = target.v.position || 0;
      const srcPos = src.v.position || 0;
      for (let i = 0; i < srcArr.length - srcPos; i++) {
        dest[destPos + i] = srcArr[srcPos + i];
      }
    };

    const format_type_map = function (rt, ctrl) {
      switch (ctrl) {
        case 'd':
        case 'i':
          return rt.intTypeLiteral;
        case 'u':
        case 'o':
        case 'x':
        case 'X':
          return rt.unsignedintTypeLiteral;
        case 'f':
        case 'F':
          return rt.floatTypeLiteral;
        case 'e':
        case 'E':
        case 'g':
        case 'G':
        case 'a':
        case 'A':
          return rt.doubleTypeLiteral;
        case 'c':
          return rt.charTypeLiteral;
        case 's':
          return rt.normalPointerType(rt.charTypeLiteral);
        case 'p':
          return rt.normalPointerType(rt.voidTypeLiteral);
        default:
          return rt.intTypeLiteral;
      }
    };

    const validate_format = function (rt, format, ...params) {
      let i = 0;
      const re = /%(?:[-+ #0])?(?:[0-9]+|\*)?(?:\.(?:[0-9]+|\*))?([diuoxXfFeEgGaAcspn])/g;
      let ctrl;
      const result = [];
      while ((ctrl = re.exec(format)) != null) {
        const type = format_type_map(rt, ctrl[1]);
        if (params.length <= i) {
          rt.raiseException(`insufficient arguments (at least ${i + 1} is required)`);
        }
        const target = params[i++];
        const casted = rt.cast(type, target);
        if (rt.isStringType(casted)) {
          result.push(rt.getStringFromCharArray(casted));
        } else {
          result.push(casted.v != null ? casted.v : 0);
        }
      }
      return result;
    };

    const __printf = function (format, ...params) {
      if (rt.isStringType(format.t)) {
        const formatStr = rt.getStringFromCharArray(format);
        const parsed_params = validate_format(rt, formatStr, ...params);
        const retval = safeFormat(formatStr, parsed_params);
        console.log('[DEBUG __printf]', JSON.stringify(formatStr), parsed_params, JSON.stringify(retval));
        return rt.makeCharArrayFromString(retval);
      } else {
        rt.raiseException('format must be a string');
      }
    };

    const _printf = function (rt, _this, format, ...params) {
      const retval = __printf(format, ...params);
      const retvalStr = rt.getStringFromCharArray(retval);
      stdio.write(retvalStr);
      return rt.val(rt.intTypeLiteral, retval.v.target.length);
    };

    const _sprintf = function (rt, _this, target, format, ...params) {
      const retval = __printf(format, ...params);
      _strcpy(rt, null, [target, retval]);
      return rt.val(rt.intTypeLiteral, retval.v.target.length);
    };

    overrideFunc(rt, 'global', 'printf', [char_pointer, '?'], rt.intTypeLiteral, _printf);
    overrideFunc(rt, 'global', 'sprintf', [char_pointer, char_pointer, '?'], rt.intTypeLiteral, _sprintf);
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

function runCTest(name, code, inputQueue = []) {
  return new Promise((resolve, reject) => {
    let output = '';
    inputStream = '';
    const queue = [...inputQueue];

    const _config = {
      stdio: {
        drain() {
          return '';
        },
        write(s) {
          output += s;
        }
      },
      includes: JSCPP.includes
    };

    try {
      const rt = new rt_1.CRuntime(_config);
      let parsedCode = preprocessor.parse(rt, code);
      if (name === 'String I/O') console.log('[PARSED CODE for String I/O]:\n', parsedCode);
      const result = PEGUtil.parse(ast, parsedCode);
      const interpreter = new interpreter_1.Interpreter(rt);
      const defGen = interpreter.run(result.ast, parsedCode);

      while (true) {
        const step = defGen.next();
        if (step.done) break;
      }

      const mainGen = rt.getFunc('global', 'main', [])(rt, null);

      let step = mainGen.next();
      let stepsCount = 0;
      const MAX_STEPS = 2000000;

      while (!step.done) {
        stepsCount++;
        if (stepsCount > MAX_STEPS) {
          return reject(new Error(`Test "${name}" exceeded step limit (infinite loop)`));
        }

        if (step.value && step.value.type === 'stdin_request') {
          if (queue.length === 0) {
            return reject(new Error(`Test "${name}" requested stdin but inputQueue is empty!`));
          }
          const nextInput = queue.shift();
          step = mainGen.next(nextInput);
        } else {
          step = mainGen.next();
        }
      }

      resolve(output);
    } catch (err) {
      reject(err);
    }
  });
}

async function dryRunAll() {
  console.log('====================================================');
  console.log('🚀 DRY RUN: COMPREHENSIVE C-MASTER IDE VALIDATION 🚀');
  console.log('====================================================\n');

  // Test 1: User default program (the one reported in error)
  console.log('[1/7] Testing User Starter Program with interactive inputs...');
  const userCode = `
#include <stdio.h>

int main() {
    int a, b;
    printf("Welcome to Cmaster Offline C IDE Mark 3!\\n");
    printf("Enter two numbers: ");
    scanf("%d %d", &a, &b);
    printf("Sum: %d + %d = %d\\n", a, b, a + b);
    return 0;
}
  `;
  const out1 = await runCTest('User Starter Program', userCode, ['15 27\n']);
  console.log('Output:\n' + out1.trim());
  if (!out1.includes('Sum: 15 + 27 = 42')) throw new Error('Test 1 failed output verification');
  console.log('✅ Test 1 PASSED.\n');

  // Test 2: Recursive Tower of Hanoi
  console.log('[2/7] Testing Recursive Tower of Hanoi...');
  const hanoiCode = `
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
    int disks;
    scanf("%d", &disks);
    hanoi(disks, 'A', 'C', 'B');
    return 0;
}
  `;
  const out2 = await runCTest('Recursive Tower of Hanoi', hanoiCode, ['3\n']);
  if (!out2.includes('Move disk 1 from A to C') || !out2.includes('Move disk 3 from A to C')) {
    throw new Error('Test 2 failed Hanoi verification');
  }
  console.log('✅ Test 2 PASSED.\n');

  // Test 3: QuickSort with pointer swap
  console.log('[3/7] Testing QuickSort with Pointer Swap...');
  const qsCode = `
#include <stdio.h>

void swap(int* a, int* b) {
    int t = *a;
    *a = *b;
    *b = t;
}

int partition(int arr[], int low, int high) {
    int pivot = arr[high];
    int i = (low - 1);
    for (int j = low; j <= high - 1; j++) {
        if (arr[j] < pivot) {
            i++;
            swap(&arr[i], &arr[j]);
        }
    }
    swap(&arr[i + 1], &arr[high]);
    return (i + 1);
}

void quickSort(int arr[], int low, int high) {
    if (low < high) {
        int pi = partition(arr, low, high);
        quickSort(arr, low, pi - 1);
        quickSort(arr, pi + 1, high);
    }
}

int main() {
    int arr[] = {10, 7, 8, 9, 1, 5};
    int n = 6;
    quickSort(arr, 0, n - 1);
    printf("Sorted array: ");
    for (int i = 0; i < n; i++)
        printf("%d ", arr[i]);
    printf("\\n");
    return 0;
}
  `;
  const out3 = await runCTest('QuickSort', qsCode);
  console.log('Output: ' + out3.trim());
  if (!out3.includes('1 5 7 8 9 10')) throw new Error('Test 3 failed QuickSort verification');
  console.log('✅ Test 3 PASSED.\n');

  // Test 4: Recursive Backtracking (N-Queens count)
  console.log('[4/7] Testing Recursive Backtracking (4-Queens)...');
  const nQueensCode = `
#include <stdio.h>

int count = 0;

int isSafe(int board[4][4], int row, int col) {
    int i, j;
    for (i = 0; i < col; i++)
        if (board[row][i]) return 0;
    for (i = row, j = col; i >= 0 && j >= 0; i--, j--)
        if (board[i][j]) return 0;
    for (i = row, j = col; j >= 0 && i < 4; i++, j--)
        if (board[i][j]) return 0;
    return 1;
}

void solveNQUtil(int board[4][4], int col) {
    if (col >= 4) {
        count++;
        return;
    }
    for (int i = 0; i < 4; i++) {
        if (isSafe(board, i, col)) {
            board[i][col] = 1;
            solveNQUtil(board, col + 1);
            board[i][col] = 0;
        }
    }
}

int main() {
    int board[4][4] = {{0,0,0,0},{0,0,0,0},{0,0,0,0},{0,0,0,0}};
    solveNQUtil(board, 0);
    printf("4-Queens solutions found: %d\\n", count);
    return 0;
}
  `;
  const out4 = await runCTest('N-Queens', nQueensCode);
  console.log('Output: ' + out4.trim());
  if (!out4.includes('4-Queens solutions found: 2')) throw new Error('Test 4 failed N-Queens verification');
  console.log('✅ Test 4 PASSED.\n');

  // Test 5: String I/O with getchar & gets & sprintf
  console.log('[5/7] Testing String I/O, getchar(), gets(), sprintf()...');
  const strCode = `
#include <stdio.h>

int main() {
    char buf[100];
    char ch;
    printf("Reading char: ");
    ch = getchar();
    printf("Got char: %c\\n", ch);
    
    sprintf(buf, "Formatted value: %0.2f, hex: %X", 3.14159, 255);
    printf("Buffer: %s\\n", buf);
    return 0;
}
  `;
  const out5 = await runCTest('String I/O', strCode, ['Z\n']);
  console.log('Output:\n' + out5.trim());
  if (!out5.includes('Got char: Z') || !out5.includes('3.14') || !out5.includes('hex: FF')) {
    throw new Error('Test 5 failed String I/O verification');
  }
  console.log('✅ Test 5 PASSED.\n');

  // Test 6: Recursive Factorial and Fibonacci
  console.log('[6/7] Testing Recursive Factorial and Fibonacci...');
  const recCode = `
#include <stdio.h>

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int fibonacci(int n) {
    if (n <= 0) return 0;
    if (n == 1) return 1;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    printf("Fact(5)=%d\\n", factorial(5));
    printf("Fib(7)=%d\\n", fibonacci(7));
    return 0;
}
  `;
  const out6 = await runCTest('Recursion', recCode);
  console.log('Output:\n' + out6.trim());
  if (!out6.includes('Fact(5)=120') || !out6.includes('Fib(7)=13')) {
    throw new Error('Test 6 failed Recursion verification');
  }
  console.log('✅ Test 6 PASSED.\n');

  // Test 7: Multi-turn sequential interactive input prompts
  console.log('[7/7] Testing Sequential Multi-turn Interactive Input...');
  const multiPromptCode = `
#include <stdio.h>

int main() {
    int choice;
    printf("Select option (1 for Add, 2 for Mul): ");
    scanf("%d", &choice);
    int x, y;
    printf("Enter x: ");
    scanf("%d", &x);
    printf("Enter y: ");
    scanf("%d", &y);
    if (choice == 1) {
        printf("Result: %d\\n", x + y);
    } else {
        printf("Result: %d\\n", x * y);
    }
    return 0;
}
  `;
  const out7 = await runCTest('Multi-turn Prompts', multiPromptCode, ['2\n', '7\n', '8\n']);
  console.log('Output:\n' + out7.trim());
  if (!out7.includes('Result: 56')) throw new Error('Test 7 failed Multi-turn verification');
  console.log('✅ Test 7 PASSED.\n');

  // Test 8: App Default Code (Recursive Factorial with interactive scanf)
  console.log('[8/9] Testing App DEFAULT_CODE (Factorial + interactive scanf)...');
  const defaultAppCode = `
#include <stdio.h>
#include <stdlib.h>

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    printf("Cmaster IDE - Offline WASM C Engine\\n");
    int num;
    printf("Enter number for factorial: ");
    scanf("%d", &num);
    printf("Factorial of %d = %d\\n", num, factorial(num));
    return 0;
}
  `;
  const out8 = await runCTest('App Default Code', defaultAppCode, ['6\n']);
  console.log('Output:\n' + out8.trim());
  if (!out8.includes('Factorial of 6 = 720')) throw new Error('Test 8 failed DEFAULT_CODE verification');
  console.log('✅ Test 8 PASSED.\n');

  // Test 9: Syntax Error & Exception Safety Dry Run
  console.log('[9/9] Testing Syntax Error & Exception Graceful Handling...');
  let caughtSyntax = false;
  try {
    await runCTest('Bad Syntax', `int main() { printf("missing semicolon") return 0; }`);
  } catch (err) {
    caughtSyntax = true;
    console.log('Successfully and safely caught syntax error:', err.message?.substring(0, 60));
  }
  if (!caughtSyntax) throw new Error('Failed to catch syntax error');
  console.log('✅ Test 9 PASSED.\n');

  console.log('====================================================');
  console.log('🎉 ALL 9 DRY RUN SUITES PASSED FLAWLESSLY! 🎉');
  console.log('====================================================');
}

dryRunAll().catch(err => {
  console.error('❌ DRY RUN FAILED:', err);
  process.exit(1);
});
