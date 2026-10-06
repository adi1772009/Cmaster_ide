package com.aditech.cmaster

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * MainActivity - hosts the full-screen WebView loading the React UI.
 *
 * Phase 2: Triggers TCC asset extraction on first launch (before WebView loads).
 * Phase 3: Registers CompilerBridge as JavaScript interface ("Android").
 */
class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "CmasterMain"
    }

    private lateinit var webView: WebView
    private lateinit var bridge: CompilerBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        bridge = CompilerBridge(this, webView)

        // Phase 2: Extract TCC support files on first launch
        // Runs on a background thread, but WebView load happens after
        Thread {
            try {
                TccExtractor.extractIfNeeded(this)
                Log.d(TAG, "TCC extraction complete. tcc/lib: ${filesDir}/tcc/lib/")
                Log.d(TAG, "TCC extraction complete. tcc/include: ${filesDir}/tcc/include/")
            } catch (e: Exception) {
                Log.e(TAG, "TCC extraction failed: ${e.message}", e)
            }
        }.start()

        setupWebView()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
            databaseEnabled = true
            // Needed for CodeMirror and modern JS features
            javaScriptCanOpenWindowsAutomatically = false
            mediaPlaybackRequiresUserGesture = false
        }

        // Phase 3: Register the compiler bridge as "Android" in JavaScript
        // The React app checks: if (window.Android) { use native bridge }
        webView.addJavascriptInterface(bridge, "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Keep all navigation within WebView (file:// URLs)
                val url = request.url.toString()
                return !url.startsWith("file://")
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                Log.d(TAG, "WebView page loaded: $url")
            }
        }

        // Load the React app from assets
        // Vite build is configured with base='./' so asset paths are relative
        webView.loadUrl("file:///android_asset/www/index.html")
    }

    override fun onBackPressed() {
        // Navigate back in WebView history if possible
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        bridge.cleanup()
        webView.destroy()
        super.onDestroy()
    }
}
