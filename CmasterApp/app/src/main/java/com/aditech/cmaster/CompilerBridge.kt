package com.aditech.cmaster

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import java.io.OutputStream
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Phase 3 - JavaScript ↔ Android bridge for TCC compilation and execution.
 *
 * Exposes methods to the WebView's JavaScript context under the name "Android".
 * Implements REAL interactive terminal behavior per the implementation plan:
 *   - Program runs and produces output continuously
 *   - When program blocks on scanf/fgets, user types in the live terminal input row
 *   - That text is written to process stdin immediately and flushed
 *   - Execution resumes and further output appears in the same scrolling view
 *
 * Phase 4: Parses TCC error messages and calls back with line numbers for editor highlighting.
 * Phase 3 watchdog: Kills process after 10 seconds of no output (configurable).
 */
class CompilerBridge(
    private val context: Context,
    private val webView: WebView
) {

    companion object {
        private const val TAG = "CompilerBridge"
        private const val WATCHDOG_TIMEOUT_SEC = 10L
        // TCC error pattern: filename.c:LINE: error: message
        private val ERROR_PATTERN = Regex("""(.+\.c):(\d+):\s*(error|warning):\s*(.+)""")
    }

    @Volatile private var process: Process? = null
    @Volatile private var processStdin: OutputStream? = null
    private val isRunning = AtomicBoolean(false)

    // Watchdog: kills process after WATCHDOG_TIMEOUT_SEC of no output
    private val watchdogScheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    @Volatile private var watchdogFuture: ScheduledFuture<*>? = null

    // Thread pool for I/O streaming
    private val ioExecutor = Executors.newCachedThreadPool()

    /**
     * Called by JavaScript: runCode(codeString)
     * Writes code to a temp file, launches TCC with -run, streams output back.
     */
    @JavascriptInterface
    fun runCode(code: String) {
        if (isRunning.getAndSet(true)) {
            sendToJs("error", "[Already running. Stop the current process first.]\n")
            return
        }

        ioExecutor.execute {
            try {
                // Write source code to private storage
                val srcDir = File(context.filesDir, "src").also { it.mkdirs() }
                val srcFile = File(srcDir, "main.c")
                srcFile.writeText(code)

                val tccBin = File(context.applicationInfo.nativeLibraryDir, "libtcc_bin.so")
                val tccLib = File(context.filesDir, "tcc/lib")
                val tccInc = File(context.filesDir, "tcc/include")
                val archInc = File(tccInc, "aarch64-linux-android")

                if (!tccBin.exists()) {
                    sendToJs("error", "[Error: TCC binary not found at ${tccBin.absolutePath}]\n")
                    sendToJs("done", "-1")
                    isRunning.set(false)
                    return@execute
                }

                // Build include args - add arch-specific dir if it exists
                val cmd = mutableListOf(
                    tccBin.absolutePath,
                    "-B", tccLib.absolutePath,
                    "-I", tccInc.absolutePath
                )
                if (archInc.exists()) {
                    cmd.addAll(listOf("-I", archInc.absolutePath))
                }
                cmd.addAll(listOf("-lm", "-run", srcFile.absolutePath))

                Log.d(TAG, "Launching TCC: ${cmd.joinToString(" ")}")

                val pb = ProcessBuilder(cmd).apply {
                    redirectErrorStream(false)
                    environment().apply {
                        put("TMPDIR", context.cacheDir.absolutePath)
                        put("HOME", context.filesDir.absolutePath)
                    }
                }

                process = pb.start()
                processStdin = process!!.outputStream
                resetWatchdog()

                // Stream STDERR (compiler errors) in background
                ioExecutor.execute {
                    try {
                        val reader = process!!.errorStream.bufferedReader()
                        var line: String?
                        while (reader.readLine().also { line = it } != null) {
                            val l = line!!
                            handleErrorLine(l)
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "stderr reader ended: ${e.message}")
                    }
                }

                // Stream STDOUT in background
                ioExecutor.execute {
                    try {
                        val buf = CharArray(256)
                        val reader = process!!.inputStream.bufferedReader()
                        var n: Int
                        while (reader.read(buf).also { n = it } != -1) {
                            val text = String(buf, 0, n)
                            sendToJs("output", text)
                            resetWatchdog() // Reset watchdog on any output
                        }
                    } catch (e: Exception) {
                        Log.d(TAG, "stdout reader ended: ${e.message}")
                    }

                    // stdout closed → process finished
                    val exitCode = try { process?.waitFor() ?: -1 } catch (e: Exception) { -1 }
                    cancelWatchdog()
                    isRunning.set(false)
                    processStdin = null
                    process = null
                    sendToJs("done", exitCode.toString())
                    Log.d(TAG, "Process exited with code $exitCode")
                }

            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch TCC: ${e.message}", e)
                sendToJs("error", "[Launch error: ${e.message}]\n")
                sendToJs("done", "-1")
                isRunning.set(false)
            }
        }
    }

    /**
     * Called by JavaScript: sendStdin(text)
     * Writes user input to the running process's stdin immediately.
     * This is the real interactive terminal input - typed at the moment
     * the program actually asks for it, not pre-collected before running.
     */
    @JavascriptInterface
    fun sendStdin(input: String) {
        val stdin = processStdin
        if (stdin == null) {
            Log.w(TAG, "sendStdin called but no process is running")
            return
        }
        ioExecutor.execute {
            try {
                stdin.write(input.toByteArray(Charsets.UTF_8))
                stdin.flush()
                resetWatchdog() // User is actively interacting - reset watchdog
                Log.d(TAG, "Sent stdin: ${input.trimEnd()}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to write stdin: ${e.message}")
                sendToJs("error", "[Stdin write error: ${e.message}]\n")
            }
        }
    }

    /**
     * Called by JavaScript: stopProcess()
     * Kills the running process immediately (user-triggered or Stop button).
     */
    @JavascriptInterface
    fun stopProcess() {
        cancelWatchdog()
        process?.destroyForcibly()
        process = null
        processStdin = null
        isRunning.set(false)
        Log.d(TAG, "Process stopped by user")
    }

    /**
     * Called by JavaScript: isProcessRunning()
     * Returns true if a process is currently executing.
     */
    @JavascriptInterface
    fun isProcessRunning(): Boolean = isRunning.get()

    // ─── Phase 4: Error line parsing ──────────────────────────────────────────

    private fun handleErrorLine(line: String) {
        sendToJs("error", line + "\n")

        // Parse TCC error format: filename.c:LINE: error: message
        val match = ERROR_PATTERN.find(line)
        if (match != null) {
            val lineNum = match.groupValues[2].toIntOrNull() ?: return
            val severity = match.groupValues[3] // "error" or "warning"
            val message = match.groupValues[4]
            // Notify JS to highlight the error line in the editor
            sendToJs("compiler_error", """{"line":$lineNum,"severity":"$severity","message":${JSONObject.quote(message)}}""")
        }
    }

    // ─── Watchdog ─────────────────────────────────────────────────────────────

    private fun resetWatchdog() {
        watchdogFuture?.cancel(false)
        watchdogFuture = watchdogScheduler.schedule({
            val p = process
            if (p != null && p.isAlive) {
                Log.w(TAG, "Watchdog triggered: no output for ${WATCHDOG_TIMEOUT_SEC}s")
                p.destroyForcibly()
                sendToJs("output", "\n[Process killed: no output for ${WATCHDOG_TIMEOUT_SEC} seconds]\n")
                sendToJs("done", "-1")
                isRunning.set(false)
                processStdin = null
                process = null
            }
        }, WATCHDOG_TIMEOUT_SEC, TimeUnit.SECONDS)
    }

    private fun cancelWatchdog() {
        watchdogFuture?.cancel(false)
        watchdogFuture = null
    }

    // ─── JS communication ─────────────────────────────────────────────────────

    /**
     * Sends a message to JavaScript via window.__tccCallback(type, data).
     * Called from background threads - posts to main thread for WebView.
     */
    private fun sendToJs(type: String, data: String) {
        val escaped = JSONObject.quote(data)
        webView.post {
            webView.evaluateJavascript(
                "window.__tccCallback && window.__tccCallback('$type', $escaped)",
                null
            )
        }
    }

    fun cleanup() {
        stopProcess()
        watchdogScheduler.shutdownNow()
        ioExecutor.shutdownNow()
    }
}
