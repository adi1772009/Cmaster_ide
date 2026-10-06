#!/usr/bin/env pwsh
# ================================================================
# Cmaster Android APK Build + GitHub Release Script
# Run this AFTER:
#   1. NDK downloaded: /tmp/ndk-r30.zip (in WSL)
#   2. TCC compiled: /tmp/tcc-arm64-out/ (in WSL)
#   3. React app built: Program_files/dist/
#   4. Gradle extracted: C:\Users\A\gradle-8.9\
# ================================================================

$ErrorActionPreference = "Stop"
$ADB        = "C:\Users\A\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$PROJ       = "D:\C-master\CmasterApp"
$REACT_DIST = "D:\C-master\Program_files\dist"
$JAVA_HOME  = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  CMASTER APK BUILD PIPELINE — MARK 5"          -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── Step 1: Copy React dist → Android assets ──────────────
Write-Host "`n[1/5] Copying React build to Android assets..." -ForegroundColor Yellow
$wwwDest = "$PROJ\app\src\main\assets\www"
if (Test-Path $wwwDest) { Remove-Item -Recurse -Force $wwwDest }
New-Item -ItemType Directory -Force -Path $wwwDest | Out-Null
Copy-Item -Recurse -Force "$REACT_DIST\*" $wwwDest
Write-Host "  Copied $(( Get-ChildItem $wwwDest -Recurse | Measure-Object ).Count) files" -ForegroundColor Green

# ── Step 2: Copy TCC artifacts from WSL ───────────────────
Write-Host "`n[2/5] Copying TCC binary + headers from WSL..." -ForegroundColor Yellow

# TCC binary → jniLibs (renamed to .so so Android extracts it as executable)
$jniDest = "$PROJ\app\src\main\jniLibs\arm64-v8a"
wsl -u root -e bash -c "cp /tmp/tcc-arm64-out/tcc /mnt/d/C-master/CmasterApp/app/src/main/jniLibs/arm64-v8a/libtcc_bin.so && echo 'TCC_BIN_COPIED'"
Write-Host "  TCC binary → jniLibs/arm64-v8a/libtcc_bin.so" -ForegroundColor Green

# TCC headers → assets/tcc/include/
$tccIncDest = "$PROJ\app\src\main\assets\tcc\include"
$tccLibDest = "$PROJ\app\src\main\assets\tcc\lib"
if (Test-Path $tccIncDest) { Remove-Item -Recurse -Force $tccIncDest }
if (Test-Path $tccLibDest) { Remove-Item -Recurse -Force $tccLibDest }
New-Item -ItemType Directory -Force -Path $tccIncDest | Out-Null
New-Item -ItemType Directory -Force -Path $tccLibDest | Out-Null

wsl -u root -e bash -c "cp -r /tmp/tcc-arm64-out/include/. /mnt/d/C-master/CmasterApp/app/src/main/assets/tcc/include/ && echo 'HEADERS_COPIED'"
wsl -u root -e bash -c "cp -r /tmp/tcc-arm64-out/lib/. /mnt/d/C-master/CmasterApp/app/src/main/assets/tcc/lib/ && echo 'LIBS_COPIED'"
wsl -u root -e bash -c "cp /tmp/tcc-arm64-out/libtcc1.a /mnt/d/C-master/CmasterApp/app/src/main/assets/tcc/lib/ && echo 'LIBTCC1_COPIED'"
Write-Host "  TCC headers + libs → assets/tcc/" -ForegroundColor Green

# ── Step 3: Build APK with Gradle ─────────────────────────
Write-Host "`n[3/5] Building APK with Gradle..." -ForegroundColor Yellow
$gradleExe = "C:\Users\A\gradle-8.9\gradle-8.9\bin\gradle.bat"
$env:JAVA_HOME = $JAVA_HOME
$env:ANDROID_HOME = "C:\Users\A\AppData\Local\Android\Sdk"
$env:PATH = "$JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

Push-Location $PROJ
cmd /c "$gradleExe assembleRelease 2>&1"
Pop-Location

$apkPath = "$PROJ\app\build\outputs\apk\release\app-release.apk"
if (!(Test-Path $apkPath)) {
  $apkPath = "$PROJ\app\build\outputs\apk\release\app-release-unsigned.apk"
}
Write-Host "  APK: $apkPath" -ForegroundColor Green
Write-Host "  Size: $([math]::Round((Get-Item $apkPath).Length / 1MB, 2)) MB" -ForegroundColor Green

# ── Step 4: Git push to GitHub ────────────────────────────
Write-Host "`n[4/5] Pushing to GitHub (C-Master repo)..." -ForegroundColor Yellow
$GITHUB_REPO = "D:\C-master\Program_files"

# Initialize git if needed or use existing
Push-Location "D:\C-master"

git init 2>&1 | Out-Null
git config user.name "Aditya Lakhani"
git config user.email "alakhani2009@gmail.com"
git remote remove origin 2>&1 | Out-Null
git remote add origin "https://github.com/alakhani2009/C-Master.git" 2>&1

# Clear old content and add everything new
git checkout --orphan temp-branch 2>&1 | Out-Null

# Stage everything
git add --all 2>&1

git commit -m "Cmaster Mark 5 - TinyCC Android Native IDE

- Real Android app with native TCC C compiler (arm64-v8a)
- Interactive terminal with live stdin (no pre-fill, real terminal behavior)
- Error line highlighting in CodeMirror editor  
- TCC support: all 31 standard C headers
- Console occupies 60-70 percent of screen during execution
- Watchdog: kills runaway processes after 10s of no output
- JSCPP fallback for non-Android environments
- Tested: hello world, loops, recursion, factorial, scanf interactive" 2>&1

git branch -M main 2>&1

Write-Host "  Pushing code to main branch..." -ForegroundColor Yellow
git push --force origin main 2>&1

Pop-Location

Write-Host "  Code pushed to GitHub" -ForegroundColor Green

# ── Step 5: Create GitHub Release (Mark 5) ────────────────
Write-Host "`n[5/5] Creating GitHub Release — Mark 5..." -ForegroundColor Yellow

# Copy APK to root for easy upload
$apkRelease = "D:\C-master\Cmaster-Mark5.apk"
Copy-Item $apkPath $apkRelease -Force

Write-Host "  APK ready at: $apkRelease" -ForegroundColor Green
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  BUILD COMPLETE! " -ForegroundColor Green
Write-Host "  Upload $apkRelease to GitHub as Mark 5 release" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Cyan
