/// <reference lib="webworker" />

// @ts-expect-error - JSCPP types
import * as JSCPPModule from 'JSCPP'

const JSCPP: any =
  (JSCPPModule as any).default ||
  JSCPPModule ||
  (typeof require !== 'undefined' ? require('JSCPP') : null)

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

function createInteractiveCstdio(baseCstdio: any, requestInput: () => string) {
  return {
    load(rt: any) {
      baseCstdio.load(rt)

      const char_pointer = rt.normalPointerType(rt.charTypeLiteral)
      const { stdio } = rt.config
      let input_stream: string = (stdio && typeof stdio.drain === 'function' ? stdio.drain() : '') || ''

      function ensureInput(regex: RegExp) {
        while (!regex.test(input_stream)) {
          const fresh = requestInput()
          if (!fresh || fresh.length === 0) break
          input_stream += fresh
        }
      }

      function _consume_next_char(): string {
        while (input_stream.length === 0) {
          const fresh = requestInput()
          if (!fresh || fresh.length === 0) throw new Error('EOF')
          input_stream += fresh
        }
        const ch = input_stream[0]
        input_stream = input_stream.substr(1)
        return ch
      }

      function _consume_next_line(): string {
        while (input_stream.indexOf('\n') === -1) {
          const fresh = requestInput()
          if (!fresh || fresh.length === 0) break
          input_stream += fresh
        }
        const nextBreak = input_stream.indexOf('\n')
        let retval = ''
        if (nextBreak > -1) {
          retval = input_stream.substr(0, nextBreak)
          input_stream = input_stream.replace(`${retval}\n`, '')
        } else {
          retval = input_stream
          input_stream = ''
        }
        return retval
      }

      function _get_input(pre: string | null, next: string | null, match: string, _type?: string): string | null {
        const replace = (pre ? pre : '') + `(${match})`
        const re = new RegExp(replace)
        ensureInput(re)
        const tmp = input_stream
        const m = tmp.match(re)
        if (!m) return null
        const result = m[1]
        input_stream = input_stream.substr(input_stream.indexOf(result)).replace(result, '')
        if (next) {
          input_stream = input_stream.replace(next, '')
        }
        return result
      }

      function _get_integer(pre: string | null, next: string | null): number | null {
        const text = _get_input(pre, next, '[-]?[A-Za-z0-9]+')
        if (!text) return null
        if (text[0] === '0') {
          if (text[1] === 'x' || text[1] === 'X') {
            return parseInt(text.substr(2), 16)
          }
          return parseInt(text, 8)
        }
        return parseInt(text, 10)
      }

      function _get_float(pre: string | null, next: string | null): number | null {
        const text = _get_input(pre, next, '[-]?[0-9]+[\\.]?[0-9]*')
        return text ? parseFloat(text) : null
      }

      function _get_string(pre: string | null, next: string | null): string | null {
        return _get_input(pre, next, '([^\\s]+)', 'STR')
      }

      function _get_char(): string {
        return _consume_next_char()
      }

      function _deal_type(format: string) {
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
            return _get_integer(pre, next)
          case '%f':
          case '%lf':
            return _get_float(pre, next)
          case '%s':
            return _get_string(pre, next)
          case '%c':
            return _get_char()
          default:
            return _get_integer(pre, next)
        }
      }

      function _set_pointer_value(pointer: any, value: any) {
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

      function __scanf(format: string) {
        const re = /[^%]*%[A-Za-z][^%]*/g
        const selectors = format.match(re) || []
        return Array.from(selectors).map(val => _deal_type(val))
      }

      function _scanf(rt: any, _this: any, pchar: any, ...args: any[]) {
        const format = rt.getStringFromCharArray(pchar)
        const matched = __scanf(format)
        for (let i = 0; i < matched.length; i++) {
          _set_pointer_value(args[i], matched[i])
        }
        return rt.val(rt.intTypeLiteral, matched.length)
      }

      // Override scanf, getchar, gets with interactive implementations
      overrideFunc(rt, 'global', 'scanf', [char_pointer, '?'], rt.intTypeLiteral, _scanf)

      overrideFunc(rt, 'global', 'getchar', [], rt.intTypeLiteral, (rt: any) => {
        try {
          const ch = _consume_next_char()
          return rt.val(rt.intTypeLiteral, ch.charCodeAt(0))
        } catch {
          return rt.val(rt.intTypeLiteral, -1)
        }
      })

      overrideFunc(rt, 'global', 'gets', [char_pointer], char_pointer, (rt: any, _this: any, charPtr: any) => {
        const line = _consume_next_line()
        const dest = charPtr.v.target
        for (let i = 0; i < line.length; i++) {
          dest[i] = rt.val(rt.charTypeLiteral, line.charCodeAt(i))
        }
        dest[line.length] = rt.val(rt.charTypeLiteral, 0)
        return charPtr
      })
    }
  }
}

addEventListener('message', (e: MessageEvent) => {
  const { type, code, stdin, sab, maxTimeout } = e.data
  if (type !== 'run') return

  try {
    if (!JSCPP) {
      throw new Error('JSCPP execution engine could not be initialized.')
    }

    const rt = typeof JSCPP.run === 'function' ? JSCPP : JSCPP.default || JSCPP

    if (!rt || typeof rt.run !== 'function') {
      throw new Error('JSCPP run method is unavailable.')
    }

    // Configure interactive real-time input if SharedArrayBuffer is provided
    if (sab && typeof SharedArrayBuffer !== 'undefined' && sab instanceof SharedArrayBuffer) {
      const status = new Int32Array(sab, 0, 1)
      const length = new Int32Array(sab, 4, 1)
      const charBuffer = new Uint8Array(sab, 8, 1016)

      const requestInput = (): string => {
        postMessage({ type: 'stdin_request' })
        Atomics.store(status, 0, 0)
        Atomics.wait(status, 0, 0)

        const len = length[0]
        const bytes = charBuffer.slice(0, len)
        return new TextDecoder().decode(bytes)
      }

      const baseCstdio = JSCPP.includes?.['cstdio'] || JSCPP.includes?.['stdio.h']
      if (baseCstdio) {
        const interactiveCstdio = createInteractiveCstdio(baseCstdio, requestInput)
        JSCPP.includes['cstdio'] = interactiveCstdio
        JSCPP.includes['stdio.h'] = interactiveCstdio
      }
    }

    let output = ''
    const timeoutLimit = typeof maxTimeout === 'number' && maxTimeout > 0 ? maxTimeout : 60000

    const exitCode = rt.run(code, stdin || '', {
      stdio: {
        write: (s: string) => {
          output += s
          postMessage({ type: 'output', text: s })
        },
      },
      maxTimeout: timeoutLimit,
    })
    postMessage({ type: 'done', exitCode: exitCode ?? 0 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    let formattedError = `\n[Runtime Error]: ${msg}`

    if (msg.includes('Maximum call stack size exceeded')) {
      formattedError = `\n[Recursion Stack Overflow]: Call stack depth limit reached!\nCheck that your recursive function has a valid base case that terminates.`
    } else if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('time limit')) {
      formattedError = `\n[Execution Timeout]: Program exceeded the 60-second runtime limit.\nIf running heavy recursion (e.g. naive Fibonacci), ensure the recursion reaches its base case efficiently.`
    } else if (msg.toLowerCase().includes('input stream is empty') || msg.toLowerCase().includes('eof')) {
      formattedError = `\n[Input Stream Empty]: 'scanf' requested input, but none was provided.\n💡 Tip: Provide your input in the Terminal prompt or in Settings → Terminal (Stdin).`
    }

    postMessage({ type: 'error', text: formattedError })
  }
})
