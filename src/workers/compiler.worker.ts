/// <reference lib="webworker" />

// Global polyfill for Node stream to protect against any third-party code invoking `instanceof Stream`
if (typeof self !== 'undefined') {
  class StreamPolyfill {}
  ;(self as any).Stream = StreamPolyfill
  ;(self as any).stream = { Stream: StreamPolyfill }
}

// @ts-expect-error - JSCPP types
import * as JSCPPModule from 'JSCPP'
// @ts-expect-error - JSCPP types
import * as rtModule from 'JSCPP/lib/rt'
// @ts-expect-error - JSCPP types
import * as interpreterModule from 'JSCPP/lib/interpreter'
// @ts-expect-error - JSCPP types
import * as astModule from 'JSCPP/lib/ast'
// @ts-expect-error - JSCPP types
import * as preprocessorModule from 'JSCPP/lib/preprocessor'
// @ts-expect-error - pegjs-util types
import * as PEGUtilModule from 'pegjs-util'

const JSCPP: any = (JSCPPModule as any).default || JSCPPModule
const CRuntime: any = (rtModule as any).CRuntime || (rtModule as any).default?.CRuntime || rtModule
const Interpreter: any = (interpreterModule as any).Interpreter || (interpreterModule as any).default?.Interpreter || interpreterModule
const ast: any = (astModule as any).default || astModule
const preprocessor: any = (preprocessorModule as any).default || preprocessorModule
const PEGUtil: any = (PEGUtilModule as any).default || PEGUtilModule

import {
  setupStandardHeaders,
  extractAndRegisterStructs,
  patchRuntime,
  patchInterpreter,
  prepareSourceCode
} from './cStandardLibraries'

function overrideFunc(rt: any, lt: any, name: string, args: any[], retType: any, impl: any) {
  const ltsig = rt.getTypeSignature(lt)
  if (ltsig in rt.types) {
    const t = rt.types[ltsig].handlers
    if (t[name]) {
      const sig = rt.makeParametersSignature(args)
      if (t[name].functions) delete t[name].functions[sig]
      if (t[name].reg) delete t[name].reg[sig]
    }
  }
  rt.regFunc(impl, lt, name, args, retType)
}

function safeFormat(fmt: string, args: any[]): string {
  let argIdx = 0
  return fmt.replace(/%(-?\d+)?(?:\.(\d+))?([a-zA-Z%])/g, (match, width, prec, spec) => {
    if (spec === '%') return '%'
    if (argIdx >= args.length) return match
    const val = args[argIdx++]
    let str = ''
    switch (spec) {
      case 'd':
      case 'i':
      case 'ld':
      case 'lld':
        str = String(parseInt(val, 10) || 0)
        break
      case 'u':
      case 'lu':
      case 'llu':
        str = String(Math.max(0, parseInt(val, 10) || 0))
        break
      case 'x':
        str = (parseInt(val, 10) || 0).toString(16)
        break
      case 'X':
        str = (parseInt(val, 10) || 0).toString(16).toUpperCase()
        break
      case 'o':
        str = (parseInt(val, 10) || 0).toString(8)
        break
      case 'f':
      case 'lf': {
        const p = prec !== undefined ? parseInt(prec, 10) : 6
        str = (parseFloat(val) || 0).toFixed(p)
        break
      }
      case 'g':
      case 'e':
      case 'E': {
        str = String(parseFloat(val) || 0)
        break
      }
      case 'c':
        str = typeof val === 'number' ? String.fromCharCode(val) : String(val)
        break
      case 's':
        str = String(val !== undefined && val !== null ? val : '')
        break
      case 'p':
        str = '0x' + (parseInt(val, 10) || 0).toString(16)
        break
      default:
        str = String(val)
    }
    if (width) {
      const w = parseInt(width, 10)
      if (w > 0) {
        str = str.padStart(w, ' ')
      } else if (w < 0) {
        str = str.padEnd(-w, ' ')
      }
    }
    return str
  })
}

let inputStream = ''

function* ensureInput(regex: RegExp) {
  while (!regex.test(inputStream)) {
    const fresh: unknown = yield { type: 'stdin_request' }
    if (typeof fresh === 'string') {
      inputStream += fresh
    } else {
      break
    }
  }
}

function* _consume_next_char(): Generator<{ type: string }, string, unknown> {
  while (inputStream.length === 0) {
    const fresh: unknown = yield { type: 'stdin_request' }
    if (typeof fresh === 'string') {
      inputStream += fresh
    } else {
      throw new Error('EOF')
    }
  }
  const ch = inputStream[0]
  inputStream = inputStream.substr(1)
  return ch
}

function* _consume_next_line(): Generator<{ type: string }, string, unknown> {
  while (inputStream.indexOf('\n') === -1) {
    const fresh: unknown = yield { type: 'stdin_request' }
    if (typeof fresh === 'string') {
      inputStream += fresh
    } else {
      break
    }
  }
  const nextBreak = inputStream.indexOf('\n')
  let retval = ''
  if (nextBreak > -1) {
    retval = inputStream.substr(0, nextBreak)
    inputStream = inputStream.replace(`${retval}\n`, '')
  } else {
    retval = inputStream
    inputStream = ''
  }
  return retval
}

function* _get_input(pre: string | null, next: string | null, match: string): Generator<{ type: string }, string | null, unknown> {
  const replace = (pre ? pre : '') + `(${match})`
  const re = new RegExp(replace)
  yield* ensureInput(re)
  const tmp = inputStream
  const m = tmp.match(re)
  if (!m) return null
  const result = m[1]
  inputStream = inputStream.substr(inputStream.indexOf(result)).replace(result, '')
  if (next) {
    inputStream = inputStream.replace(next, '')
  }
  return result
}

function* _get_integer(pre: string | null, next: string | null): Generator<{ type: string }, number | null, unknown> {
  const text: string | null = yield* _get_input(pre, next, '[-]?[A-Za-z0-9]+')
  if (!text) return null
  if (text[0] === '0') {
    if (text[1] === 'x' || text[1] === 'X') {
      return parseInt(text.substr(2), 16)
    }
    return parseInt(text, 8)
  }
  return parseInt(text, 10)
}

function* _get_float(pre: string | null, next: string | null): Generator<{ type: string }, number | null, unknown> {
  const text: string | null = yield* _get_input(pre, next, '[-]?[0-9]+[\\.]?[0-9]*')
  return text ? parseFloat(text) : null
}

function* _get_string(pre: string | null, next: string | null): Generator<{ type: string }, string | null, unknown> {
  return yield* _get_input(pre, next, '([^\\s]+)')
}

function* _deal_type(format: string): Generator<{ type: string }, any, unknown> {
  const res = format.match(/%[A-Za-z]+/)
  if (!res) return null
  const type = res[0]
  const res2 = format.match(/[^%]*/)
  const pre = res2 ? res2[0] : null
  const next = format.substr(format.indexOf(type) + type.length)
  switch (type) {
    case '%d':
    case '%ld':
    case '%i':
    case '%u':
    case '%lu':
    case '%llu':
      return yield* _get_integer(pre, next)
    case '%f':
    case '%lf':
      return yield* _get_float(pre, next)
    case '%s':
      return yield* _get_string(pre, next)
    case '%c':
      return yield* _consume_next_char()
    default:
      return yield* _get_integer(pre, next)
  }
}

function _set_pointer_value(rt: any, pointer: any, value: any) {
  if (!pointer || !pointer.v) return
  if (rt.isNormalPointerType(pointer)) {
    if (rt.isNumericType(pointer.t.targetType)) {
      const nv = rt.val(pointer.t.targetType, value, true)
      pointer.v.target.v = nv.v
    } else {
      const chCode = typeof value === 'string' ? value.charCodeAt(0) : value
      const nv = rt.val(pointer.t.targetType, chCode, true)
      pointer.v.target.v = nv.v
    }
  } else if (rt.isArrayType(pointer)) {
    if (rt.isNumericType(pointer.t.eleType)) {
      const nv = rt.val(pointer.t.eleType, value, true)
      const pos = pointer.v.position || 0
      pointer.v.target[pos] = nv
    } else {
      const str = String(value || '')
      const srcArray = rt.makeCharArrayFromString(str)
      const pos = pointer.v.position || 0
      for (let i = 0; i < srcArray.v.target.length; i++) {
        pointer.v.target[pos + i] = srcArray.v.target[i]
      }
      if (pos + srcArray.v.target.length < pointer.v.target.length) {
        pointer.v.target[pos + srcArray.v.target.length] = rt.val(rt.charTypeLiteral, 0)
      }
    }
  }
}

function* customScanf(rt: any, _this: any, pchar: any, ...args: any[]): Generator<{ type: string }, any, unknown> {
  const format = rt.getStringFromCharArray(pchar)
  const re = /[^%]*%[A-Za-z][^%]*/g
  const selectors = format.match(re) || []
  for (let i = 0; i < selectors.length; i++) {
    const val = yield* _deal_type(selectors[i])
    _set_pointer_value(rt, args[i], val)
  }
  return rt.val(rt.intTypeLiteral, selectors.length)
}

function registerInteractiveCstdio() {
  const baseCstdio = JSCPP.includes?.['cstdio'] || JSCPP.includes?.['stdio.h']
  if (!baseCstdio) return

  const customCstdio = {
    load(rt: any) {
      baseCstdio.load(rt)
      const char_pointer = rt.normalPointerType(rt.charTypeLiteral)
      const { stdio } = rt.config

      const _strcpy = (rt: any, _this: any, [target, src]: any[]) => {
        const dest = target.v.target
        const srcArr = src.v.target
        const destPos = target.v.position || 0
        const srcPos = src.v.position || 0
        for (let i = 0; i < srcArr.length - srcPos; i++) {
          dest[destPos + i] = srcArr[srcPos + i]
        }
      }

      const format_type_map = function (rt: any, ctrl: string) {
        switch (ctrl) {
          case 'd':
          case 'i':
            return rt.intTypeLiteral
          case 'u':
          case 'o':
          case 'x':
          case 'X':
            return rt.unsignedintTypeLiteral
          case 'f':
          case 'F':
            return rt.floatTypeLiteral
          case 'e':
          case 'E':
          case 'g':
          case 'G':
          case 'a':
          case 'A':
            return rt.doubleTypeLiteral
          case 'c':
            return rt.charTypeLiteral
          case 's':
            return rt.normalPointerType(rt.charTypeLiteral)
          case 'p':
            return rt.normalPointerType(rt.voidTypeLiteral)
          default:
            return rt.intTypeLiteral
        }
      }

      const validate_format = function (rt: any, format: string, ...params: any[]) {
        let i = 0
        const re = /%(?:[-+ #0])?(?:[0-9]+|\*)?(?:\.(?:[0-9]+|\*))?(?:l|ll|h|hh|z)?([diuoxXfFeEgGaAcspn])/g
        let ctrl: any
        const result: any[] = []
        while ((ctrl = re.exec(format)) != null) {
          const type = format_type_map(rt, ctrl[1])
          if (params.length <= i) {
            rt.raiseException(`insufficient arguments (at least ${i + 1} is required)`)
          }
          const target = params[i++]
          const casted = rt.cast(type, target)
          if (rt.isStringType(casted)) {
            result.push(rt.getStringFromCharArray(casted))
          } else {
            result.push(casted.v != null ? casted.v : 0)
          }
        }
        return result
      }

      const __printf = function (format: any, ...params: any[]) {
        if (rt.isStringType(format.t)) {
          const formatStr = rt.getStringFromCharArray(format)
          const parsed_params = validate_format(rt, formatStr, ...params)
          const retval = safeFormat(formatStr, parsed_params)
          return rt.makeCharArrayFromString(retval)
        } else {
          rt.raiseException('format must be a string')
        }
      }

      const _printf = function (rt: any, _this: any, format: any, ...params: any[]) {
        const retval = __printf(format, ...params)
        const retvalStr = rt.getStringFromCharArray(retval)
        stdio.write(retvalStr)
        return rt.val(rt.intTypeLiteral, retval.v.target.length)
      }

      const _sprintf = function (rt: any, _this: any, target: any, format: any, ...params: any[]) {
        const retval = __printf(format, ...params)
        _strcpy(rt, null, [target, retval])
        return rt.val(rt.intTypeLiteral, retval.v.target.length)
      }

      overrideFunc(rt, 'global', 'printf', [char_pointer, '?'], rt.intTypeLiteral, _printf)
      overrideFunc(rt, 'global', 'sprintf', [char_pointer, char_pointer, '?'], rt.intTypeLiteral, _sprintf)
      overrideFunc(rt, 'global', 'scanf', [char_pointer, '?'], rt.intTypeLiteral, customScanf)
      overrideFunc(rt, 'global', 'getchar', [], rt.intTypeLiteral, function* (rt: any) {
        try {
          const ch: string = yield* _consume_next_char()
          return rt.val(rt.intTypeLiteral, ch.charCodeAt(0))
        } catch {
          return rt.val(rt.intTypeLiteral, -1)
        }
      })
      overrideFunc(rt, 'global', 'gets', [char_pointer], char_pointer, function* (rt: any, _this: any, charPtr: any) {
        const line: string = yield* _consume_next_line()
        const dest = charPtr.v.target
        for (let i = 0; i < line.length; i++) {
          dest[i] = rt.val(rt.charTypeLiteral, line.charCodeAt(i))
        }
        dest[line.length] = rt.val(rt.charTypeLiteral, 0)
        return charPtr
      })
    }
  }

  JSCPP.includes['cstdio'] = customCstdio
  JSCPP.includes['stdio.h'] = customCstdio
}

// Global generator runner state
let currentGen: any = null
let startTime = 0
let timeoutLimit = 60000

function formatError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  let formatted = `\n[Runtime Error]: ${msg}`

  if (msg.includes('Maximum call stack size exceeded')) {
    formatted = `\n[Recursion Stack Overflow]: Call stack depth limit reached!\nCheck that your recursive function has a valid base case that terminates.`
  } else if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('time limit')) {
    formatted = `\n[Execution Timeout]: Program exceeded the ${Math.round(timeoutLimit / 1000)}-second runtime limit.\nIf running heavy recursion, ensure the recursion reaches its base case efficiently.`
  }
  return formatted
}

function stepLoop(nextInput?: string) {
  try {
    let nextVal: any = nextInput
    while (true) {
      const step = currentGen.next(nextVal)
      nextVal = undefined

      if (step.done) {
        postMessage({ type: 'done', exitCode: step.value?.v ?? 0 })
        currentGen = null
        break
      }

      if (step.value && step.value.type === 'stdin_request') {
        postMessage({ type: 'stdin_request' })
        break
      }

      if (Date.now() - startTime > timeoutLimit) {
        throw new Error('Time limit exceeded.')
      }
    }
  } catch (err: unknown) {
    currentGen = null
    postMessage({ type: 'error', text: formatError(err) })
  }
}

addEventListener('message', (e: MessageEvent) => {
  const { type, code, stdin, text, maxTimeout } = e.data

  if (type === 'run') {
    try {
      if (!JSCPP) {
        throw new Error('JSCPP execution engine could not be initialized.')
      }

      setupStandardHeaders(JSCPP.includes)
      registerInteractiveCstdio()

      inputStream = stdin || ''
      timeoutLimit = typeof maxTimeout === 'number' && maxTimeout > 0 ? maxTimeout : 60000
      startTime = Date.now()

      const _config = {
        stdio: {
          drain() {
            return inputStream
          },
          write(s: string) {
            postMessage({ type: 'output', text: s })
          }
        },
        includes: JSCPP.includes
      }

      const structSizes: Record<string, number> = {}
      const rt = new CRuntime(_config)
      patchRuntime(rt, structSizes)
      extractAndRegisterStructs(rt, code, structSizes)

      const preparedCode = prepareSourceCode(code)
      const parsedCode = preprocessor.parse(rt, preparedCode)
      const result = PEGUtil.parse(ast, parsedCode)
      if (result.error != null) {
        throw new Error('ERROR: Parsing Failure:\n' + PEGUtil.errorMessage(result.error, true))
      }

      const interpreter = new Interpreter(rt)
      patchInterpreter(interpreter)
      const defGen = interpreter.run(result.ast, parsedCode)
      while (true) {
        const step = defGen.next()
        if (step.done) break
      }

      currentGen = rt.getFunc('global', 'main', [])(rt, null)
      stepLoop()
    } catch (err: unknown) {
      currentGen = null
      postMessage({ type: 'error', text: formatError(err) })
    }
  } else if (type === 'stdin_response') {
    if (currentGen) {
      stepLoop(text)
    }
  } else if (type === 'stop') {
    currentGen = null
  }
})
