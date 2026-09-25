import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { EditorView, EditorSelection } from '@uiw/react-codemirror'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { monokai } from '@uiw/codemirror-theme-monokai'
import { nord } from '@uiw/codemirror-theme-nord'
import { gruvboxDark } from '@uiw/codemirror-theme-gruvbox-dark'
import { cCompletionExtension } from './utils/cCompletion'

type AppFile = { name: string; content: string; output: string }
type ThemeId = 'green' | 'orange-light' | 'cyan' | 'purple' | 'crimson' | 'amber'
type NavSection = 'Project' | 'Settings'
type ProjectView = 'editor' | 'files'
type SettingsTab = 'Appearance' | 'Editor' | 'Terminal' | 'About'
type SyntaxTheme = 'dracula' | 'monokai' | 'nord' | 'gruvbox-dark'

const THEMES: Record<ThemeId, string> = {
  green: 'theme-green', 'orange-light': 'theme-orange-light',
  cyan: 'theme-cyan', purple: 'theme-purple',
  crimson: 'theme-crimson', amber: 'theme-amber',
}

const SYNTAX_THEMES = { dracula, monokai, nord, 'gruvbox-dark': gruvboxDark }

const SYMBOLS = ['{', '}', '(', ')', '<', '>', ';', '#', '->', '&', '*', '[', ']', '=', '%', '"', "'"]

const DEFAULT_CODE = `#include <stdio.h>
#include <stdlib.h>

// Recursion test
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
}`

const DEFAULT_FILES: AppFile[] = [
  { name: 'main.c', content: DEFAULT_CODE, output: '' },
  { name: 'helper.h', content: `// Header File\n#define GREETING "Welcome to Cmaster IDE!"\n`, output: '' },
]

const STORAGE_KEY = 'cmaster_workspace_v2'

function loadFiles(): AppFile[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : DEFAULT_FILES
  } catch {
    return DEFAULT_FILES
  }
}

export default function App() {
  const [files, setFiles] = useState<AppFile[]>(loadFiles)
  const [activeIdx, setActiveIdx] = useState(0)
  const [theme, setTheme] = useState<ThemeId>('green')
  const [nav, setNav] = useState<NavSection>('Project')
  const [projectView, setProjectView] = useState<ProjectView>('editor')
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('Appearance')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState('')
  const [consoleIsError, setConsoleIsError] = useState(false)
  const [stdinInput, setStdinInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isWaitingForInput, setIsWaitingForInput] = useState(false)
  const [liveInputValue, setLiveInputValue] = useState('')
  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>('dracula')
  const [editorFontSize, setEditorFontSize] = useState(16)
  const [termFontSize, setTermFontSize] = useState(15)
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'ready' | 'typing' | 'saved'>('ready')

  const workerRef = useRef<Worker | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const liveInputRef = useRef<HTMLInputElement>(null)

  const activeFile = files[Math.min(activeIdx, files.length - 1)]

  const scrollOutput = () => {
    requestAnimationFrame(() => {
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
    })
  }

  const handleWorkerMessage = useCallback((e: MessageEvent) => {
    const { type, text, exitCode } = e.data
    if (type === 'output') {
      setConsoleOutput(p => p + text)
      scrollOutput()
    } else if (type === 'stdin_request') {
      setIsWaitingForInput(true)
      scrollOutput()
      requestAnimationFrame(() => {
        liveInputRef.current?.focus()
      })
    } else if (type === 'done') {
      setConsoleOutput(p => p + `\n${'─'.repeat(40)}\nProcess exited with code ${exitCode}.`)
      setIsRunning(false)
      setIsWaitingForInput(false)
    } else if (type === 'error') {
      setConsoleOutput(p => p + text)
      setConsoleIsError(true)
      setIsRunning(false)
      setIsWaitingForInput(false)
    }
  }, [])

  const spawnWorker = useCallback(() => {
    const w = new Worker(new URL('./workers/compiler.worker.ts', import.meta.url), { type: 'module' })
    w.addEventListener('message', handleWorkerMessage)
    return w
  }, [handleWorkerMessage])

  useEffect(() => {
    workerRef.current = spawnWorker()
    return () => workerRef.current?.terminate()
  }, [spawnWorker])

  const persistFiles = useCallback((f: AppFile[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f))
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('ready'), 2000)
  }, [])

  const updateContent = useCallback((content: string) => {
    setFiles(prev => {
      const next = prev.map((f, i) => i === activeIdx ? { ...f, content } : f)
      clearTimeout(saveTimerRef.current!)
      setSaveStatus('typing')
      saveTimerRef.current = setTimeout(() => persistFiles(next), 1000)
      return next
    })
  }, [activeIdx, persistFiles])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        persistFiles(files)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [files, persistFiles])

  const switchFile = (idx: number) => {
    setFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, output: consoleOutput } : f))
    setActiveIdx(idx)
    setConsoleOutput(files[idx]?.output || '')
    setConsoleIsError(false)
  }

  const closeTab = (idx: number) => {
    if (files.length <= 1) return
    const next = files.filter((_, i) => i !== idx)
    const newIdx = idx >= next.length ? next.length - 1 : idx
    setFiles(next)
    setActiveIdx(newIdx)
    persistFiles(next)
  }

  const createFile = () => {
    const name = prompt('New file name:', 'new_file.c')
    if (!name?.trim()) return
    const newFile: AppFile = {
      name: name.trim(),
      content: `#include <stdio.h>\n\nint main() {\n    printf("Hello!\\n");\n    return 0;\n}`,
      output: '',
    }
    setFiles(prev => {
      const next = [...prev, newFile]
      persistFiles(next)
      return next
    })
    setActiveIdx(files.length)
    setProjectView('editor')
    setNav('Project')
  }

  const openFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const newFile: AppFile = { name: file.name, content: ev.target?.result as string, output: '' }
      setFiles(prev => {
        const next = [...prev, newFile]
        persistFiles(next)
        setActiveIdx(next.length - 1)
        return next
      })
      setProjectView('editor')
      setNav('Project')
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const saveToDevice = (asNew = false) => {
    let name = activeFile.name
    if (asNew) {
      const n = prompt('Save as:', name)
      if (!n?.trim()) return
      name = n.trim()
      if (name !== activeFile.name) {
        setFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, name } : f))
      }
    }
    const blob = new Blob([activeFile.content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const runCode = () => {
    if (!workerRef.current) return
    setConsoleOpen(true)
    setConsoleOutput(`Compiling...\n${'─'.repeat(40)}\n`)
    setConsoleIsError(false)
    setIsRunning(true)

    // Preprocess source: shim missing headers and inline workspace header files
    let source = activeFile.content

    // Inline custom header includes matching workspace files (e.g. #include "helper.h")
    files.forEach(f => {
      if (f.name.endsWith('.h') && f.name !== activeFile.name) {
        const includeRegex = new RegExp(`#include\\s*["<]${f.name.replace('.', '\\.')}[">]`, 'g')
        source = source.replace(includeRegex, `// Inlined ${f.name}\n${f.content}\n`)
      }
    })

    // Shim <stdbool.h> if included
    if (/#include\s*<stdbool\.h>/.test(source)) {
      source = source.replace(/#include\s*<stdbool\.h>/g, '// Shimming stdbool.h\n#define bool int\n#define true 1\n#define false 0\n')
    }

    // Shim <limits.h> if included
    if (/#include\s*<limits\.h>/.test(source)) {
      source = source.replace(/#include\s*<limits\.h>/g, '// Shimming limits.h\n#define INT_MAX 2147483647\n#define INT_MIN -2147483648\n')
    }

    workerRef.current.postMessage({
      type: 'run',
      code: source,
      stdin: stdinInput,
    })
  }

  const handleSendLiveInput = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!isWaitingForInput) return
    const inputToSend = liveInputValue + '\n'
    setConsoleOutput(p => p + liveInputValue + '\n')
    scrollOutput()

    workerRef.current?.postMessage({
      type: 'stdin_response',
      text: inputToSend,
    })

    setLiveInputValue('')
    setIsWaitingForInput(false)
  }

  const stopCode = () => {
    workerRef.current?.postMessage({ type: 'stop' })
    workerRef.current?.terminate()
    setConsoleOutput(p => p + '\n[Stopped by user.]')
    setIsRunning(false)
    setIsWaitingForInput(false)
    setLiveInputValue('')
    workerRef.current = spawnWorker()
  }

  const insertSymbol = (sym: string) => {
    const view = editorViewRef.current
    if (!view) return
    view.dispatch(view.state.changeByRange((range: { from: number; to: number }) => ({
      changes: { from: range.from, to: range.to, insert: sym },
      range: EditorSelection.cursor(range.from + sym.length),
    })))
    view.focus()
  }

  const fontExt = useMemo(() => EditorView.theme({
    '&': { fontSize: `${editorFontSize}px` },
    '.cm-content': { fontFamily: "'Consolas', 'Courier New', monospace" },
  }), [editorFontSize])

  const saveLabel = saveStatus === 'typing' ? 'Typing...' : saveStatus === 'saved' ? '✓ Saved' : '✓ Ready'
  const saveLabelColor = saveStatus === 'typing' ? 'text-zinc-400' : 'text-emerald-400'

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${THEMES[theme]} app-bg`}>

      {/* HEADER */}
      <header className="h-14 card-bg border-b border-theme flex items-center justify-between px-3 sm:px-6 flex-shrink-0 gap-2">
        <div className="flex flex-col justify-center min-w-0 flex-shrink">
          <h1 className="viking-title text-[15px] sm:text-lg leading-none font-black text-viking-gradient truncate uppercase">Cmaster</h1>
          <span className="viking-subtext text-[8px] sm:text-[11px] font-bold text-emerald-400 opacity-90 leading-tight uppercase tracking-wider mt-0.5">BY ADITECH SOLUTIONS</span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <nav className="flex items-center gap-1">
            {(['Project', 'Settings'] as NavSection[]).map(n => (
              <button key={n} onClick={() => setNav(n)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-bold text-[11px] sm:text-xs ${nav === n ? 'accent-bg text-white' : 'sub-bg hover:opacity-80'}`}>
                {n}
              </button>
            ))}
          </nav>
          <button
            onClick={isRunning ? stopCode : runCode}
            className={`${isRunning ? 'bg-red-500 hover:bg-red-600' : 'accent-bg'} text-white font-bold px-3 sm:px-4 py-1 sm:py-1.5 rounded-md flex items-center gap-1 text-[11px] sm:text-xs shadow-md`}
          >
            <span>{isRunning ? '■' : '▶'}</span>
            <span>{isRunning ? 'Stop' : 'Run'}</span>
          </button>
        </div>
      </header>

      {/* SUB-ACTION BAR */}
      <div className="h-10 sm:h-11 sub-bg border-b border-theme flex items-center px-2 sm:px-6 gap-2 overflow-x-auto flex-shrink-0">
        {nav === 'Project' && (
          <>
            {(['editor', 'files'] as ProjectView[]).map(v => (
              <button key={v} onClick={() => setProjectView(v)}
                className={`text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md border border-theme whitespace-nowrap capitalize ${projectView === v ? 'accent-bg text-white' : 'sub-bg hover:opacity-80'}`}>
                {v === 'editor' ? 'Code Editor' : 'Local Files'}
              </button>
            ))}
            <button onClick={() => setConsoleOpen(o => !o)}
              className={`text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md border border-theme whitespace-nowrap ${consoleOpen ? 'accent-bg text-white' : 'sub-bg hover:opacity-80'}`}>
              {'>_'} Terminal
            </button>
          </>
        )}
        {nav === 'Settings' && (
          (['Appearance', 'Editor', 'Terminal', 'About'] as SettingsTab[]).map(tab => (
            <button key={tab} onClick={() => setSettingsTab(tab)}
              className={`text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md border border-theme whitespace-nowrap ${settingsTab === tab ? 'accent-bg text-white' : 'sub-bg hover:opacity-80'}`}>
              {tab}
            </button>
          ))
        )}
      </div>

      {/* MAIN */}
      <main className="flex-1 relative overflow-hidden flex flex-col">

        {/* EDITOR */}
        {nav === 'Project' && projectView === 'editor' && (
          <div className={`flex flex-col min-h-0 ${consoleOpen ? (isTerminalMaximized ? 'hidden' : 'flex-[0_0_28%]') : 'flex-1'}`}>
            <div className="sub-bg px-3 py-1 text-[11px] font-mono border-b border-theme flex justify-between items-center text-zinc-400 flex-shrink-0">
              <span>Active: {activeFile?.name}</span>
              <span className={`text-xs ${saveLabelColor}`}>{saveLabel}</span>
            </div>

            {/* File tabs */}
            <div className="card-bg border-b border-theme flex items-center px-2 gap-1 overflow-x-auto flex-shrink-0 h-9">
              {files.map((f, idx) => (
                <button key={idx} onClick={() => switchFile(idx)}
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-t-lg flex items-center gap-1.5 border-t border-x border-theme whitespace-nowrap ${idx === activeIdx ? 'accent-bg text-white' : 'sub-bg text-zinc-300 hover:opacity-80'}`}>
                  📄 {f.name}
                  {files.length > 1 && (
                    <span onClick={ev => { ev.stopPropagation(); closeTab(idx) }}
                      className="hover:text-red-400 ml-0.5 leading-none">×</span>
                  )}
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <CodeMirror
                value={activeFile?.content ?? ''}
                height="100%"
                style={{ height: '100%' }}
                extensions={[cpp(), cCompletionExtension, fontExt]}
                theme={SYNTAX_THEMES[syntaxTheme]}
                onChange={updateContent}
                onCreateEditor={view => { editorViewRef.current = view as EditorView }}
                basicSetup={{ lineNumbers: true, tabSize: 4, closeBrackets: true, autocompletion: true, bracketMatching: true }}
              />
            </div>

            {/* Symbol bar */}
            <div className="h-11 card-bg border-t border-theme flex items-center px-2 gap-1 overflow-x-auto flex-shrink-0">
              {SYMBOLS.map(sym => (
                <button key={sym} onClick={() => insertSymbol(sym)}
                  className="h-8 min-w-[30px] sm:min-w-[36px] sub-bg font-mono font-bold rounded text-sm flex items-center justify-center border border-theme flex-shrink-0">
                  {sym}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* FILES VIEW */}
        {nav === 'Project' && projectView === 'files' && (
          <div className="flex-1 p-4 overflow-y-auto app-bg">
            <div className="max-w-3xl mx-auto card-bg border border-theme rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-theme pb-4">
                <h2 className="text-xl font-bold">📂 Local Directory Manager</h2>
                <button onClick={createFile} className="accent-bg text-white text-xs font-bold px-3 py-2 rounded-lg">+ New File</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between cursor-pointer">
                  <span>📄 Open File</span>
                  <span className="text-xs accent-text">Browse →</span>
                  <input type="file" className="hidden" accept=".c,.h,.txt" onChange={openFile} />
                </label>
                <button onClick={() => saveToDevice(false)} className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between">
                  <span>💾 Save File</span><span className="text-xs accent-text">Export →</span>
                </button>
                <button onClick={() => saveToDevice(true)} className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between">
                  <span>📝 Save As…</span><span className="text-xs accent-text">Export →</span>
                </button>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Workspace Files</h3>
                {files.map((f, idx) => (
                  <div key={idx} className="p-3 sub-bg rounded-xl border border-theme flex justify-between items-center">
                    <span className="font-bold font-mono text-sm">{f.name}{idx === activeIdx ? ' (Active)' : ''}</span>
                    <button onClick={() => { switchFile(idx); setProjectView('editor') }} className="text-xs accent-text font-bold">Open →</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {nav === 'Settings' && (
          <div className="flex-1 p-4 overflow-y-auto app-bg">
            <div className="max-w-2xl mx-auto card-bg border border-theme rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-6">⚙ {settingsTab}</h2>

              {settingsTab === 'Appearance' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold block">App Color Scheme</label>
                  <select value={theme} onChange={e => setTheme(e.target.value as ThemeId)}
                    className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm">
                    <option value="green">Emerald Green (Default)</option>
                    <option value="orange-light">Orange / Bright White</option>
                    <option value="cyan">Deep Cyan Cyber</option>
                    <option value="purple">Royal Purple Dark</option>
                    <option value="crimson">Crimson Red</option>
                    <option value="amber">Amber Gold</option>
                  </select>
                </div>
              )}

              {settingsTab === 'Editor' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold block">Font Size</label>
                    <select value={editorFontSize} onChange={e => setEditorFontSize(Number(e.target.value))}
                      className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm">
                      {[8,10,12,14,16,18,20,24,28,36].map(s => (
                        <option key={s} value={s}>{s}px{s === 16 ? ' (Default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold block">Syntax Theme</label>
                    <select value={syntaxTheme} onChange={e => setSyntaxTheme(e.target.value as SyntaxTheme)}
                      className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm">
                      <option value="dracula">Dracula Dark</option>
                      <option value="monokai">Monokai Classic</option>
                      <option value="nord">Nord Cold Blue</option>
                      <option value="gruvbox-dark">Gruvbox Retro Dark</option>
                    </select>
                  </div>
                </div>
              )}

              {settingsTab === 'Terminal' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold block">Terminal Font Size</label>
                    <select value={termFontSize} onChange={e => setTermFontSize(Number(e.target.value))}
                      className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm">
                      {[12,14,15,16,18,20,24].map(s => (
                        <option key={s} value={s}>{s}px{s === 15 ? ' (Default)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold block">Program Stdin (Pre-fill Input)</label>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Type the values your program reads with <code className="accent-text">scanf</code>. One value per line.
                      These are fed to the program automatically when you click Run.
                    </p>
                    <textarea
                      value={stdinInput}
                      onChange={e => setStdinInput(e.target.value)}
                      rows={5}
                      placeholder={"5\n(for the factorial example above)"}
                      className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm font-mono resize-none"
                    />
                  </div>
                </div>
              )}

              {settingsTab === 'About' && (
                <div className="space-y-6">
                  <div className="sub-bg p-5 rounded-2xl border border-theme space-y-3 text-sm leading-relaxed">
                    <h3 className="text-base font-bold accent-text flex items-center gap-2">⚡ Offline WASM C Engine</h3>
                    <p><strong>Cmaster</strong> uses JSCPP — a full C interpreter running entirely in your browser/device with zero server calls. It supports recursion, dynamic allocation, and standard C library I/O. Works completely offline after the first load.</p>
                    <p className="text-xs text-zinc-400">Cmaster Mark 4 · SafeFormat Engine · Editor: CodeMirror 6 · 100% Offline</p>
                  </div>

                  <ContactForm />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TERMINAL PANEL */}
        {consoleOpen && (
          <div className={`flex flex-col card-bg border-t border-theme ${nav === 'Project' && projectView === 'editor' && !isTerminalMaximized ? 'flex-1 min-h-0' : 'absolute inset-0 z-20'} p-3.5 sm:p-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-theme mb-3 flex-shrink-0">
              <span className="accent-text font-mono font-bold flex items-center gap-2 text-sm sm:text-base">
                &gt;_ Terminal
                {isRunning && (
                  <span className="text-xs text-amber-400 animate-pulse">
                    {isWaitingForInput ? '⌨ Waiting for Input...' : '● Running'}
                  </span>
                )}
              </span>
              <div className="flex gap-1.5 sm:gap-2 items-center">
                {isRunning && <button onClick={stopCode} className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-md">■ Stop</button>}
                <button onClick={runCode} disabled={isRunning} className="accent-bg text-white text-xs font-bold px-3 py-1.5 rounded-md disabled:opacity-50">▶ Run</button>
                <button
                  onClick={() => setIsTerminalMaximized(m => !m)}
                  title={isTerminalMaximized ? 'Restore View' : 'Maximize Terminal'}
                  className="sub-bg text-xs font-bold px-2.5 py-1.5 rounded-md border border-theme hover:opacity-80 flex items-center gap-1"
                >
                  <span>{isTerminalMaximized ? '🗗' : '⛶'}</span>
                  <span>{isTerminalMaximized ? 'Restore' : 'Maximize'}</span>
                </button>
                <button onClick={() => { setConsoleOpen(false); setIsTerminalMaximized(false) }} className="sub-bg text-xs px-2.5 py-1.5 rounded-md border border-theme hover:opacity-80">✕</button>
              </div>
            </div>

            <pre
              ref={outputRef}
              className="flex-1 min-h-0 font-mono overflow-y-auto whitespace-pre-wrap leading-relaxed p-4 app-bg rounded-xl border border-theme shadow-inner tracking-wide"
              style={{ color: consoleIsError ? '#f87171' : '#34d399', fontSize: `${termFontSize}px` }}
            >
              {consoleOutput || 'Click ▶ Run to execute.\n\nTip: You can enter scanf inputs live in the terminal or pre-fill in Settings → Terminal.'}
            </pre>

            {isWaitingForInput && (
              <form onSubmit={handleSendLiveInput} className="mt-3 flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 flex items-center sub-bg rounded-xl border-2 border-emerald-400/90 px-3.5 py-2.5 shadow-lg focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/30">
                  <span className="text-emerald-400 font-mono text-base font-bold mr-2 select-none">&gt;</span>
                  <input
                    ref={liveInputRef}
                    type="text"
                    value={liveInputValue}
                    onChange={e => setLiveInputValue(e.target.value)}
                    placeholder="Enter input here (scanf) and tap Send..."
                    className="w-full bg-transparent outline-none text-sm sm:text-base font-mono text-white placeholder:text-zinc-500"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="accent-bg text-white font-bold px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                >
                  <span>Send</span>
                  <span>↵</span>
                </button>
              </form>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const send = () => {
    if (!name || !email || !message) { alert('Please fill all fields.'); return }
    const sub = encodeURIComponent(`Cmaster Feedback from ${name}`)
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`)
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=alakhani2009@gmail.com&su=${sub}&body=${body}`, '_blank')
  }

  return (
    <div className="card-bg border border-theme rounded-2xl p-5 space-y-5">
      <h3 className="text-lg font-bold">✉️ Contact Us</h3>
      <div className="space-y-4 text-sm">
        {[['Your Name', name, setName, 'text'], ['Your Email', email, setEmail, 'email']].map(([label, val, setter, type]) => (
          <div key={label as string}>
            <label className="block mb-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">{label as string}</label>
            <input type={type as string} value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)}
              placeholder={`Enter your ${(label as string).toLowerCase()}`}
              className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm" />
          </div>
        ))}
        <div>
          <label className="block mb-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">Message</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
            placeholder="Share your thoughts or feedback..."
            className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm resize-none" />
        </div>
        <button onClick={send} className="w-full accent-bg text-white font-bold py-3 rounded-xl text-sm">Send Message</button>
      </div>
      <div className="border-t border-theme pt-4 text-xs text-zinc-400">
        <span className="font-bold">Developer: </span>Aditya Lakhani · alakhani2009@gmail.com · +91 94260 27727
      </div>
    </div>
  )
}
