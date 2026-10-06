/// <reference lib="webworker" />

// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSCPP = require('JSCPP')

addEventListener('message', (e: MessageEvent) => {
  const { type, code, stdin } = e.data
  if (type !== 'run') return

  try {
    const rt = JSCPP.run
      ? JSCPP
      : JSCPP.default

    let output = ''
    const exitCode = rt.run(code, stdin || '', {
      stdio: {
        write: (s: string) => {
          output += s
          postMessage({ type: 'output', text: s })
        },
      },
      maxTimeout: 30000,
    })
    postMessage({ type: 'done', exitCode: exitCode ?? 0 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    postMessage({ type: 'error', text: `\n[Runtime Error]: ${msg}` })
  }
})
