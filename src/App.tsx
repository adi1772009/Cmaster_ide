import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { EditorView, EditorSelection } from '@uiw/react-codemirror'
import { closeBrackets } from '@codemirror/autocomplete'
import { dracula } from '@uiw/codemirror-theme-dracula'
import { monokai } from '@uiw/codemirror-theme-monokai'
import { nord } from '@uiw/codemirror-theme-nord'
import { gruvboxDark } from '@uiw/codemirror-theme-gruvbox-dark'
import { createCCompletionExtension } from './utils/cCompletion'
import { C_EXAMPLES, type CExample } from './utils/cExamples'

type EditorPrefs = {
  autoComplete: boolean
  autoCloseBrackets: boolean
  bracketMatching: boolean
  lineNumbers: boolean
}

const PREFS_STORAGE_KEY = 'cmaster_editor_prefs_v2'

const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  autoComplete: true,
  autoCloseBrackets: true,
  bracketMatching: true,
  lineNumbers: true,
}

function loadEditorPrefs(): EditorPrefs {
  try {
    const saved = localStorage.getItem(PREFS_STORAGE_KEY)
    return saved ? { ...DEFAULT_EDITOR_PREFS, ...JSON.parse(saved) } : DEFAULT_EDITOR_PREFS
  } catch {
    return DEFAULT_EDITOR_PREFS
  }
}

const BRACKET_PAIRS: Record<string, string> = {
  '(': ')',
  '{': '}',
  '[': ']',
  '<': '>',
  '"': '"',
  "'": "'",
}
const CLOSING_BRACKETS = new Set([')', '}', ']', '>', '"', "'"])

type AppFile = { name: string; content: string; output: string; isSavedToDevice?: boolean }
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
  { name: 'main.c', content: DEFAULT_CODE, output: '', isSavedToDevice: false },
  { name: 'helper.h', content: `// Header File\n#define GREETING "Welcome to Cmaster IDE!"\n`, output: '', isSavedToDevice: false },
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

// Preprocessor to inline workspace headers and inject compatibility shims for complex C code
function preprocessCode(mainCode: string, allFiles: AppFile[]): string {
  let code = mainCode
  const fileMap = new Map(allFiles.map(f => [f.name, f.content]))

  // Resolve local #include "file.h"
  for (let depth = 0; depth < 5; depth++) {
    const includeRegex = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gm
    let hasIncludes = false
    code = code.replace(includeRegex, (match, fileName) => {
      hasIncludes = true
      if (fileMap.has(fileName)) {
        return `// Begin included: ${fileName}\n` + fileMap.get(fileName) + `\n// End included: ${fileName}\n`
      }
      return match
    })
    if (!hasIncludes) break
  }

  // Inject <stdbool.h> shim if referenced
  if (code.includes('<stdbool.h>')) {
    code = code.replace(/^[ \t]*#include[ \t]+<stdbool\.h>[ \t]*$/gm,
      '#ifndef _STDBOOL_H\n#define _STDBOOL_H\n#define bool int\n#define true 1\n#define false 0\n#endif\n')
  }

  // Inject <limits.h> shim if referenced
  if (code.includes('<limits.h>')) {
    code = code.replace(/^[ \t]*#include[ \t]+<limits\.h>[ \t]*$/gm,
      '#ifndef _LIMITS_H\n#define _LIMITS_H\n#define INT_MAX 2147483647\n#define INT_MIN (-2147483647 - 1)\n#define CHAR_BIT 8\n#endif\n')
  }

  return code
}

export default function App() {
  const [files, setFiles] = useState<AppFile[]>(loadFiles)
  const [activeIdx, setActiveIdx] = useState(0)
  const [theme, setTheme] = useState<ThemeId>('green')
  const [nav, setNav] = useState<NavSection>('Project')
  const [projectView, setProjectView] = useState<ProjectView>('editor')
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('Appearance')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState('')
  const [consoleIsError, setConsoleIsError] = useState(false)
  const [stdinInput, setStdinInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [syntaxTheme, setSyntaxTheme] = useState<SyntaxTheme>('dracula')
  const [editorFontSize, setEditorFontSize] = useState(16)
  const [termFontSize, setTermFontSize] = useState(14)
  const [saveStatus, setSaveStatus] = useState<'ready' | 'typing' | 'saved'>('ready')
  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>(loadEditorPrefs)

  const updateEditorPrefs = (patch: Partial<EditorPrefs>) => {
    setEditorPrefs(prev => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  const workerRef = useRef<Worker | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const fileHandlesRef = useRef<Map<string, any>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }, [])

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
    } else if (type === 'done') {
      setConsoleOutput(p => p + `\n${'─'.repeat(40)}\nProcess exited with code ${exitCode}.`)
      setIsRunning(false)
    } else if (type === 'error') {
      setConsoleOutput(p => p + text)
      setConsoleIsError(true)
      setIsRunning(false)
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
        if (e.shiftKey) {
          handleSaveAs()
        } else {
          handleSave()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave, handleSaveAs])

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
      isSavedToDevice: false,
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

  // Save As: Always asks user to save as a new file on internal storage
  const handleSaveAs = useCallback(async () => {
    if (!activeFile) return

    // Try modern File System Access API if available
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: activeFile.name,
          types: [{
            description: 'C/C++ Source File',
            accept: { 'text/plain': ['.c', '.h', '.cpp', '.txt'] }
          }]
        })
        const writable = await handle.createWritable()
        await writable.write(activeFile.content)
        await writable.close()

        const newName = handle.name
        fileHandlesRef.current.set(newName, handle)

        setFiles(prev => {
          const next = prev.map((f, i) => i === activeIdx ? { ...f, name: newName, isSavedToDevice: true } : f)
          persistFiles(next)
          return next
        })
        showToast(`✓ Saved as new file "${newName}" on internal storage!`)
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.warn('showSaveFilePicker failed, using fallback prompt:', err)
      }
    }

    // Fallback for mobile / browsers without File System Access API
    const suggested = activeFile.isSavedToDevice ? `new_${activeFile.name}` : activeFile.name
    const chosenName = prompt('Save as new file on your device:', suggested)
    if (!chosenName?.trim()) return

    const name = chosenName.trim()
    const blob = new Blob([activeFile.content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)

    setFiles(prev => {
      const next = prev.map((f, i) => i === activeIdx ? { ...f, name, isSavedToDevice: true } : f)
      persistFiles(next)
      return next
    })
    showToast(`✓ Saved as new file "${name}" to internal storage!`)
  }, [activeFile, activeIdx, persistFiles, showToast])

  // Smart Save: If existing file on device -> writes directly to it; If new file -> prompts Save As!
  const handleSave = useCallback(async () => {
    if (!activeFile) return

    // 1. Check if we have a direct file handle (File System Access API)
    const handle = fileHandlesRef.current.get(activeFile.name)
    if (handle && typeof handle.createWritable === 'function') {
      try {
        const writable = await handle.createWritable()
        await writable.write(activeFile.content)
        await writable.close()
        persistFiles(files)
        showToast(`✓ Saved changes directly to "${activeFile.name}" on device!`)
        return
      } catch (err) {
        console.warn('File handle write failed, falling back to Save As:', err)
      }
    }

    // 2. If already marked as saved to device (fallback mode), save directly with current name
    if (activeFile.isSavedToDevice) {
      try {
        const blob = new Blob([activeFile.content], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = activeFile.name
        a.click()
        URL.revokeObjectURL(a.href)
        persistFiles(files)
        showToast(`✓ Updated "${activeFile.name}" in device storage!`)
        return
      } catch (err) {
        console.error('Save failed:', err)
      }
    }

    // 3. Otherwise, it is a NEW file! Ask user to save as a new file!
    await handleSaveAs()
  }, [activeFile, files, handleSaveAs, persistFiles, showToast])

  // Open file from device (File System Access API or input fallback)
  const handleOpenFilePicker = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'C/C++ Files',
            accept: { 'text/plain': ['.c', '.h', '.cpp', '.txt'] }
          }]
        })
        const file = await handle.getFile()
        const text = await file.text()
        fileHandlesRef.current.set(file.name, handle)

        const newFile: AppFile = {
          name: file.name,
          content: text,
          output: '',
          isSavedToDevice: true,
        }
        setFiles(prev => {
          const next = [...prev, newFile]
          persistFiles(next)
          return next
        })
        setActiveIdx(files.length)
        setProjectView('editor')
        setNav('Project')
        showToast(`✓ Opened "${file.name}" from device!`)
        return
      } catch (err: any) {
        if (err.name === 'AbortError') return
        console.warn('showOpenFilePicker failed, falling back:', err)
      }
    }

    fileInputRef.current?.click()
  }

  const openFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const newFile: AppFile = {
        name: file.name,
        content: ev.target?.result as string,
        output: '',
        isSavedToDevice: true,
      }
      setFiles(prev => {
        const next = [...prev, newFile]
        persistFiles(next)
        return next
      })
      setActiveIdx(files.length)
      setProjectView('editor')
      setNav('Project')
      showToast(`✓ Opened "${file.name}" from storage!`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const loadExample = (ex: CExample) => {
    const fileName = `${ex.id}.c`
    const existingIdx = files.findIndex(f => f.name === fileName)
    if (existingIdx >= 0) {
      setActiveIdx(existingIdx)
    } else {
      const newFile: AppFile = {
        name: fileName,
        content: ex.code,
        output: '',
      }
      const next = [...files, newFile]
      setFiles(next)
      persistFiles(next)
      setActiveIdx(next.length - 1)
    }
    if (ex.defaultStdin) {
      setStdinInput(ex.defaultStdin)
    }
    setProjectView('editor')
    setNav('Project')
    setExamplesOpen(false)
  }

  const runCode = () => {
    if (!workerRef.current) return
    setConsoleOpen(true)
    setConsoleOutput(`Compiling & Executing...\n${'─'.repeat(40)}\n`)
    setConsoleIsError(false)
    setIsRunning(true)
    const processedCode = preprocessCode(activeFile?.content || '', files)
    workerRef.current.postMessage({
      type: 'run',
      code: processedCode,
      stdin: stdinInput,
      maxTimeout: 60000,
    })
  }

  const stopCode = () => {
    workerRef.current?.terminate()
    setConsoleOutput(p => p + '\n[Stopped by user.]')
    setIsRunning(false)
    workerRef.current = spawnWorker()
  }

  const insertSymbol = (sym: string) => {
    const view = editorViewRef.current
    if (!view) return

    if (editorPrefs.autoCloseBrackets && BRACKET_PAIRS[sym]) {
      const closing = BRACKET_PAIRS[sym]
      view.dispatch(view.state.changeByRange((range: { from: number; to: number }) => {
        if (range.from !== range.to) {
          // Wrap selected text
          const selected = view.state.sliceDoc(range.from, range.to)
          return {
            changes: { from: range.from, to: range.to, insert: sym + selected + closing },
            range: EditorSelection.range(range.from + 1, range.from + 1 + selected.length),
          }
        } else {
          // Insert pair and place cursor in the middle
          return {
            changes: { from: range.from, to: range.to, insert: sym + closing },
            range: EditorSelection.cursor(range.from + 1),
          }
        }
      }))
    } else if (editorPrefs.autoCloseBrackets && CLOSING_BRACKETS.has(sym)) {
      // If cursor is right before this closing character, advance cursor over it
      const pos = view.state.selection.main.head
      const nextChar = view.state.sliceDoc(pos, pos + 1)
      if (nextChar === sym) {
        view.dispatch({ selection: EditorSelection.cursor(pos + 1) })
      } else {
        view.dispatch(view.state.changeByRange((range: { from: number; to: number }) => ({
          changes: { from: range.from, to: range.to, insert: sym },
          range: EditorSelection.cursor(range.from + sym.length),
        })))
      }
    } else {
      view.dispatch(view.state.changeByRange((range: { from: number; to: number }) => ({
        changes: { from: range.from, to: range.to, insert: sym },
        range: EditorSelection.cursor(range.from + sym.length),
      })))
    }
    view.focus()
  }

  const fontExt = useMemo(() => EditorView.theme({
    '&': { fontSize: `${editorFontSize}px` },
    '.cm-content': { fontFamily: "'Consolas', 'Courier New', monospace" },
  }), [editorFontSize])

  const editorExtensions = useMemo(() => {
    const exts = [cpp(), fontExt]
    if (editorPrefs.autoCloseBrackets) {
      exts.push(closeBrackets())
    }
    if (editorPrefs.autoComplete) {
      exts.push(createCCompletionExtension(true))
    }
    return exts
  }, [fontExt, editorPrefs.autoCloseBrackets, editorPrefs.autoComplete])

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
          <button
            onClick={() => setExamplesOpen(true)}
            title="Complex C & Recursion Examples"
            className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-bold text-[11px] sm:text-xs sub-bg hover:opacity-80 border border-theme flex items-center gap-1 text-emerald-400"
          >
            <span>⚡</span>
            <span className="hidden sm:inline">Templates</span>
          </button>
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

            <div className="flex items-center gap-1.5 ml-auto">
              <button
                onClick={handleSave}
                title="Save changes (Ctrl+S) - Saves directly to file on device, or asks Save As if new"
                className="text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md accent-bg text-white shadow-sm flex items-center gap-1 hover:opacity-90 transition-opacity"
              >
                <span>💾</span>
                <span>Save</span>
              </button>
              <button
                onClick={handleSaveAs}
                title="Save As (Ctrl+Shift+S) - Save entire code as a new file"
                className="text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md sub-bg border border-theme hover:opacity-80 flex items-center gap-1"
              >
                <span>📝</span>
                <span>Save As</span>
              </button>
              <button
                onClick={handleOpenFilePicker}
                title="Open file from internal storage"
                className="text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-md sub-bg border border-theme hover:opacity-80 flex items-center gap-1"
              >
                <span>📂</span>
                <span className="hidden sm:inline">Open</span>
              </button>
            </div>
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
          <div className={`flex flex-col min-h-0 ${consoleOpen ? 'flex-[0_0_55%]' : 'flex-1'}`}>
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
                extensions={editorExtensions}
                theme={SYNTAX_THEMES[syntaxTheme]}
                onChange={updateContent}
                onCreateEditor={view => { editorViewRef.current = view as EditorView }}
                basicSetup={{
                  lineNumbers: editorPrefs.lineNumbers,
                  tabSize: 4,
                  closeBrackets: editorPrefs.autoCloseBrackets,
                  autocompletion: editorPrefs.autoComplete,
                  bracketMatching: editorPrefs.bracketMatching,
                }}
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
                <button onClick={handleOpenFilePicker} className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between cursor-pointer">
                  <span>📄 Open File</span>
                  <span className="text-xs accent-text">Browse →</span>
                </button>
                <button onClick={handleSave} className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between">
                  <span>💾 Save File</span><span className="text-xs accent-text">{activeFile?.isSavedToDevice ? 'Direct →' : 'Save As →'}</span>
                </button>
                <button onClick={handleSaveAs} className="sub-bg border border-theme hover:opacity-80 font-bold px-3 py-3 rounded-xl flex items-center justify-between">
                  <span>📝 Save As…</span><span className="text-xs accent-text">New File →</span>
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

                  <div className="border-t border-theme pt-4 space-y-3">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Smart Code Features</h3>

                    <div className="flex items-center justify-between p-3.5 sub-bg rounded-xl border border-theme">
                      <div className="space-y-0.5 pr-2">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          Auto Code Completion
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">C / C++</span>
                        </div>
                        <div className="text-xs text-zinc-400">Suggests C keywords, stdlib functions, and snippets as you type</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle Auto Code Completion"
                        onClick={() => updateEditorPrefs({ autoComplete: !editorPrefs.autoComplete })}
                        className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 flex-shrink-0 ${editorPrefs.autoComplete ? 'accent-bg' : 'bg-zinc-700'}`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${editorPrefs.autoComplete ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 sub-bg rounded-xl border border-theme">
                      <div className="space-y-0.5 pr-2">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          Auto Bracket Closing
                          <span className="text-[10px] font-mono text-zinc-400">() {"{}"} [] "" ''</span>
                        </div>
                        <div className="text-xs text-zinc-400">Auto-inserts closing brackets and quotes on typing and symbol tap</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle Auto Bracket Closing"
                        onClick={() => updateEditorPrefs({ autoCloseBrackets: !editorPrefs.autoCloseBrackets })}
                        className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 flex-shrink-0 ${editorPrefs.autoCloseBrackets ? 'accent-bg' : 'bg-zinc-700'}`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${editorPrefs.autoCloseBrackets ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 sub-bg rounded-xl border border-theme">
                      <div className="space-y-0.5 pr-2">
                        <div className="text-sm font-semibold">Bracket Matching</div>
                        <div className="text-xs text-zinc-400">Highlights matching pairs of parentheses and brackets near cursor</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle Bracket Matching"
                        onClick={() => updateEditorPrefs({ bracketMatching: !editorPrefs.bracketMatching })}
                        className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 flex-shrink-0 ${editorPrefs.bracketMatching ? 'accent-bg' : 'bg-zinc-700'}`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${editorPrefs.bracketMatching ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 sub-bg rounded-xl border border-theme">
                      <div className="space-y-0.5 pr-2">
                        <div className="text-sm font-semibold">Line Numbers</div>
                        <div className="text-xs text-zinc-400">Show line numbers in the editor margin</div>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle Line Numbers"
                        onClick={() => updateEditorPrefs({ lineNumbers: !editorPrefs.lineNumbers })}
                        className={`w-12 h-6 rounded-full transition-colors relative flex items-center p-0.5 flex-shrink-0 ${editorPrefs.lineNumbers ? 'accent-bg' : 'bg-zinc-700'}`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-transform ${editorPrefs.lineNumbers ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {settingsTab === 'Terminal' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold block">Terminal Font Size</label>
                    <select value={termFontSize} onChange={e => setTermFontSize(Number(e.target.value))}
                      className="w-full sub-bg p-3 rounded-xl border border-theme outline-none text-sm">
                      {[12,14,16,18].map(s => (
                        <option key={s} value={s}>{s}px{s === 14 ? ' (Standard)' : ''}</option>
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
                    <p className="text-xs text-zinc-400">Engine: JSCPP v2 · Editor: CodeMirror 6 · Built with React + Vite</p>
                  </div>

                  <ContactForm />
                </div>
              )}
            </div>
          </div>
        )}

        {/* TERMINAL PANEL */}
        {consoleOpen && (
          <div className={`flex flex-col card-bg border-t border-theme ${nav === 'Project' && projectView === 'editor' ? 'flex-1 min-h-0' : 'absolute inset-0 z-20'} p-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-theme mb-3 flex-shrink-0">
              <span className="accent-text font-mono font-bold flex items-center gap-2 text-sm">
                &gt;_ Terminal
                {isRunning && <span className="text-xs text-amber-400 animate-pulse">● Running</span>}
              </span>
              <div className="flex gap-2">
                {isRunning && <button onClick={stopCode} className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-md">■ Stop</button>}
                <button onClick={runCode} disabled={isRunning} className="accent-bg text-white text-xs font-bold px-3 py-1 rounded-md disabled:opacity-50">▶ Run</button>
                <button onClick={() => setConsoleOpen(false)} className="sub-bg text-xs px-3 py-1 rounded-md border border-theme">✕</button>
              </div>
            </div>

            {/* Quick Stdin input for interactive scanf and recursion */}
            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
              <span className="text-xs font-mono font-bold text-zinc-400 whitespace-nowrap">Stdin (scanf):</span>
              <input
                type="text"
                value={stdinInput}
                onChange={e => setStdinInput(e.target.value)}
                placeholder="Inputs for scanf (e.g. 5 or 10 20), space or newline separated"
                className="flex-1 sub-bg px-2.5 py-1.5 rounded-lg border border-theme text-xs font-mono outline-none text-zinc-200 placeholder-zinc-500"
              />
            </div>

            <pre
              ref={outputRef}
              className="flex-1 min-h-0 font-mono overflow-y-auto whitespace-pre-wrap leading-relaxed p-3.5 app-bg rounded-lg border border-theme"
              style={{ color: consoleIsError ? '#f87171' : '#34d399', fontSize: `${termFontSize}px` }}
            >
              {consoleOutput || 'Click ▶ Run to execute.\n\nTip: Pre-fill scanf inputs in the Stdin box above before running.'}
            </pre>
          </div>
        )}

      </main>

      {/* EXAMPLES & RECURSION TEMPLATES MODAL */}
      {examplesOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="card-bg border border-theme rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-theme flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <span>⚡</span> Complex C & Recursion Programs
                </h3>
                <p className="text-xs text-zinc-400">Pre-built, tested C algorithms & data structures ready to run.</p>
              </div>
              <button onClick={() => setExamplesOpen(false)} className="sub-bg text-sm px-2.5 py-1 rounded-md border border-theme hover:opacity-80">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {C_EXAMPLES.map(ex => (
                <div key={ex.id} className="sub-bg p-3.5 rounded-xl border border-theme hover:border-emerald-500/50 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 uppercase tracking-wider mr-2 font-bold">
                        {ex.category}
                      </span>
                      <strong className="text-sm text-zinc-100">{ex.title}</strong>
                    </div>
                    <button
                      onClick={() => loadExample(ex)}
                      className="accent-bg text-white text-xs font-bold px-3 py-1 rounded-md shadow flex-shrink-0 hover:opacity-90"
                    >
                      Load & Run →
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{ex.description}</p>
                  {ex.defaultStdin && (
                    <div className="mt-2 text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                      <span className="text-zinc-500">Sample Stdin:</span>
                      <code className="text-emerald-400 bg-black/40 px-1.5 py-0.5 rounded border border-theme">{ex.defaultStdin.replace(/\n/g, ' ')}</code>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden File Input for fallback opening */}
      <input ref={fileInputRef} type="file" className="hidden" accept=".c,.h,.cpp,.txt" onChange={openFile} />

      {/* FLOATING TOAST NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-14 right-4 z-50 bg-emerald-600/95 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-emerald-400 backdrop-blur-sm flex items-center gap-2 animate-bounce">
          <span>{toastMsg}</span>
        </div>
      )}
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
