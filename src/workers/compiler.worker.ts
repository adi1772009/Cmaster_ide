/// <reference lib="webworker" />

// Robust import for JSCPP supporting both ESM and CommonJS
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
      formattedError = `\n[Recursion Stack Overflow]: Call stack exceeded!\nCheck that your recursive function has a terminating base case and does not exceed maximum call depth.`
    } else if (msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('time limit')) {
      formattedError = `\n[Execution Timeout]: Program ran for more than 60 seconds and was stopped.\nIf computing large recursive states (e.g. naive Fibonacci), check your loop or recursion termination condition.`
    } else if (msg.toLowerCase().includes('input stream is empty') || msg.toLowerCase().includes('eof')) {
      formattedError = `\n[Input Stream Empty]: The program called 'scanf', but no input was provided.\n💡 Tip: Pre-fill your input in the Stdin box in the Terminal before clicking Run.`
    }

    postMessage({ type: 'error', text: formattedError })
  }
})
