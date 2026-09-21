/// <reference lib="webworker" />

// @ts-expect-error - JSCPP types
import * as JSCPPModule from 'JSCPP'

const JSCPP: any =
  (JSCPPModule as any).default ||
  JSCPPModule ||
  (typeof require !== 'undefined' ? require('JSCPP') : null)

addEventListener('message', (e: MessageEvent) => {
  const { type, code, stdin, maxTimeout } = e.data
  if (type !== 'run') return

  try {
    if (!JSCPP) {
      throw new Error('JSCPP execution engine could not be initialized.')
    }

    const rt = typeof JSCPP.run === 'function' ? JSCPP : JSCPP.default || JSCPP

    if (!rt || typeof rt.run !== 'function') {
      throw new Error('JSCPP run method is unavailable.')
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
      formattedError = `\n[Input Stream Empty]: 'scanf' requested input, but none was provided.\n💡 Tip: Provide your input in Settings → Terminal (Stdin) before running.`
    }

    postMessage({ type: 'error', text: formattedError })
  }
})
