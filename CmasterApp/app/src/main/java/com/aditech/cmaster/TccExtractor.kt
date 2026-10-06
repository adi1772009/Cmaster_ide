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
        val assets = context.assets.list(assetPath) ?: return
        if (assets.isEmpty()) {
            copyAsset(context, assetPath, File(destDir, assetPath.substringAfterLast("/")))
        } else {
            val subDir = File(destDir, assetPath.substringAfterLast("/"))
            subDir.mkdirs()
            for (asset in assets) {
                extractAssetFolder(context, "$assetPath/$asset", subDir)
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
