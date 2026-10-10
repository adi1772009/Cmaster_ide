package com.aditech.cmaster

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileOutputStream

object TccExtractor {

    private const val TAG = "TccExtractor"
    private const val STAMP_FILE = "tcc/.extracted_v5"

    fun extractIfNeeded(context: Context) {
        val stamp = File(context.filesDir, STAMP_FILE)
        if (stamp.exists()) {
            Log.d(TAG, "TCC assets already extracted, skipping.")
            return
        }
        Log.d(TAG, "Extracting TCC assets to filesDir...")
        extractAssetFolder(context, "tcc", context.filesDir)
        stamp.parentFile?.mkdirs()
        stamp.writeText("Mark 5")
        Log.d(TAG, "TCC assets extracted successfully.")
    }

    private fun extractAssetFolder(context: Context, assetPath: String, destDir: File) {
        val assets = try { context.assets.list(assetPath) } catch (e: Exception) { null }
        if (assets.isNullOrEmpty()) {
            // Check if it's a file by attempting to open it
            try {
                context.assets.open(assetPath).close()
                copyAsset(context, assetPath, File(destDir, assetPath.substringAfterLast("/")))
            } catch (e: Exception) {
                // Empty directory or unreadable
            }
        } else {
            // It's a directory containing files or sub-directories
            val subDir = File(destDir, assetPath.substringAfterLast("/"))
            subDir.mkdirs()
            for (asset in assets) {
                val childAssetPath = if (assetPath.isEmpty()) asset else "$assetPath/$asset"
                // Check if child is file or directory
                val childList = try { context.assets.list(childAssetPath) } catch (e: Exception) { null }
                if (childList.isNullOrEmpty()) {
                    copyAsset(context, childAssetPath, File(subDir, asset))
                } else {
                    extractAssetFolder(context, childAssetPath, destDir)
                }
            }
        }
    }

    private fun copyAsset(context: Context, assetPath: String, destFile: File) {
        try {
            destFile.parentFile?.mkdirs()
            context.assets.open(assetPath).use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }
            Log.v(TAG, "  Extracted: $assetPath -> ${destFile.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to extract $assetPath: ${e.message}")
        }
    }
}
