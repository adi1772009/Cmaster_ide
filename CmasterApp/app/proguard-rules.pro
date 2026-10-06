# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in the Android SDK proguard-android-optimize.txt

# TinyCC binary bridge - keep all bridge methods
-keepclassmembers class com.aditech.cmaster.CompilerBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep activity and extractor
-keep class com.aditech.cmaster.** { *; }
