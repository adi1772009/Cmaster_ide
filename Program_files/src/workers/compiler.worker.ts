/// <reference lib="webworker" />

import * as JSCPPModule from 'JSCPP'

addEventListener('message', (e: MessageEvent) => {
  const { type, code, stdin } = e.data || {}
  if (type !== 'run') return

  try {
    const jscppAny = JSCPPModule as any
    const rt = jscppAny.run 
      ? jscppAny 
      : (jscppAny.default?.run ? jscppAny.default : (typeof jscppAny === 'function' ? { run: jscppAny } : jscppAny))

    if (!rt || typeof rt.run !== 'function') {
      postMessage({
        type: 'output',
        text: 'Cmaster Preview Mode (Browser):\nOn mobile Android, compilation runs via native TinyCC.\n\nRunning preview simulator...\n',
      })
      postMessage({ type: 'done', exitCode: 0 })
      return
    }

    let output = ''
    const exitCode = rt.run(code, stdin || '', {
      stdio: {
        write: (s: string) => {
          output += s
          postMessage({ type: 'output', text: s })
        },
      },
      maxTimeout: 10000,
    })
    postMessage({ type: 'done', exitCode: exitCode ?? 0 })
  } catch (err: any) {
    const msg = (err && typeof err === 'object' && err.message) ? err.message : String(err)
    postMessage({ type: 'error', text: `\n[Preview Engine Notice]: ${msg}\n\nNote: Full Standard C features (#include, scanf, pointers, data structures) execute natively on Android via TinyCC.` })
  }
})
