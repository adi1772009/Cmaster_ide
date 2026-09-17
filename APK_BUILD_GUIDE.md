# Cmaster IDE — Offline Android APK Deployment Guide

This guide walks you through building and installing **Cmaster IDE** as a **100% offline Android APK**.

---

## ⚡ How Cmaster Works 100% Offline

- **Zero Server Dependency**: Cmaster uses an internal C interpreter (`JSCPP`) executing inside a local background Web Worker (`compiler.worker.ts`).
- **Zero Network Calls**: All HTML, JavaScript, CSS, icons, and worker bundles are packaged inside the APK assets (`android/app/src/main/assets/public/`).
- **Airplane Mode Ready**: Once installed on an Android device, you can turn off Wi-Fi and mobile data completely — the editor, auto-completion, auto bracket closing, code execution, and terminal will work seamlessly offline.

---

## 🚀 Option 1: 1-Click Cloud Build with GitHub Actions (Recommended)

You don't need Android Studio or a 15 GB Android SDK installed on your computer. A ready-to-run GitHub Actions workflow (`.github/workflows/build-apk.yml`) is already configured.

### Steps:
1. **Push this project to GitHub**:
   ```bash
   git add .
   git commit -m "Add C autocompletion, auto brackets, and offline APK build"
   git push origin main
   ```
2. **Go to your GitHub Repository**:
   - Click on the **Actions** tab at the top.
   - You will see the workflow **"Build Offline Android APK"** running.
3. **Download your `.apk`**:
   - Click on the completed workflow run.
   - Under the **Artifacts** section at the bottom, click **Cmaster-Offline-APK**.
   - Download and unzip the artifact to get your `app-debug.apk`.
4. **Install on your Android Phone**:
   - Send `app-debug.apk` to your phone (via USB cable, Google Drive, WhatsApp, or email).
   - Tap the APK on your phone and choose **Install** (allow "Install Unknown Apps" if prompted).
   - Turn on **Airplane Mode** and test compiling and running your C programs!

---

## 💻 Option 2: Build Locally with Android Studio

If you have Android Studio installed on your computer:

### Step 1: Install Node Dependencies & Build Web Assets
Open PowerShell or Command Prompt in this folder and run:
```bash
cmd /c npm install
cmd /c npm run build
```

### Step 2: Initialize & Sync Capacitor Android
```bash
npx cap add android
npx cap sync android
```

### Step 3: Open in Android Studio
```bash
npx cap open android
```
*Or open Android Studio, click **Open**, and select the `android` folder in this project.*

### Step 4: Build APK
1. In Android Studio, wait for Gradle to finish syncing.
2. In the top menu, go to **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**.
3. Once completed, click the **locate** popup link to find your `app-debug.apk` in:
   `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🛠 Option 3: Build Locally via Command Line (Gradle)

If you have JDK 17+ and the Android SDK configured in your PATH:

```bash
# 1. Build the web app
cmd /c npm run build

# 2. Sync native Android project
npx cap sync android

# 3. Build APK using Gradle
cd android
.\gradlew.bat assembleDebug
```
The output APK will be at:
`android\app\build\outputs\apk\debug\app-debug.apk`

---

## ✨ Newly Added Smart Code Features in this Version

### 1. Smart C Auto-Code Completion
- **C Keywords**: Instant suggestions for `int`, `char`, `float`, `double`, `void`, `return`, `if`, `while`, `for`, `struct`, `typedef`, `sizeof`, etc.
- **C Standard Library Functions**: Complete with signatures and descriptions for `<stdio.h>`, `<stdlib.h>`, `<string.h>`, `<math.h>`, `<ctype.h>` (e.g., `printf`, `scanf`, `fopen`, `malloc`, `free`, `strlen`, `strcpy`, `sqrt`, `pow`).
- **Interactive Snippets**:
  - `main` → Expands to a clean `int main() { ... return 0; }` boilerplate.
  - `printf` → Expands to `printf("...\n");` with cursor placed inside.
  - `scanf` → Expands to `scanf("%d", &var);`.
  - `for` → Expands to `for (int i = 0; i < count; i++) { ... }`.
  - `while` / `ifelse` / `switch` / `struct` snippets.
- **Active Document Identifiers**: Any variable or function you declare in your file automatically appears in autocomplete!

### 2. Auto Bracket Closing
- Typing `(`, `{`, `[`, `"`, `'`, or `<` automatically closes the matching pair and places your cursor in the middle.
- When tapping brackets from the **On-Screen Mobile Symbol Bar**:
  - If text is selected: Wraps the selection with the brackets (e.g., selecting `num` and clicking `(` turns it into `(num)`).
  - If no text is selected: Inserts the pair `{}` and centers your cursor inside.
  - If you tap a closing bracket right before an existing one, it cleanly advances over it.

### 3. Settings Toggles
Open **Settings** → **Editor** to toggle any of these features on or off:
- **Auto Code Completion** (Default: ON)
- **Auto Bracket Closing** (Default: ON)
- **Bracket Matching** (Default: ON)
- **Line Numbers** (Default: ON)
- **Font Size** (8px – 36px)
- **Syntax Themes** (Dracula, Monokai, Nord, Gruvbox)

All preferences are stored locally in `localStorage` and persist offline.
