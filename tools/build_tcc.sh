#!/usr/bin/env bash
# ===========================================================
# Phase 1: TinyCC cross-compilation for Android arm64-v8a
# Uses: Linux NDK r30 (downloaded to /tmp/ndk-r30/)
# Output: /tmp/tcc-arm64-out/{tcc, libtcc1.a, include/, lib/}
# ===========================================================
set -e

NDK_ZIP="/tmp/ndk-r30.zip"
NDK_DIR="/tmp/android-ndk-r30"
OUT="/tmp/tcc-arm64-out"
SRC="/root/tinycc-src"

echo "======================================================"
echo " Phase 1 — TinyCC arm64-v8a cross-compilation"
echo "======================================================"

# ── Step 1: Verify NDK download ────────────────────────────
if [ ! -f "$NDK_ZIP" ]; then
  echo "ERROR: $NDK_ZIP not found. Download it first."
  exit 1
fi
echo "[1/7] NDK zip found: $(du -sh $NDK_ZIP | cut -f1)"

# ── Step 2: Extract NDK (if not already done) ─────────────
if [ ! -d "$NDK_DIR" ]; then
  echo "[2/7] Extracting NDK..."
  mkdir -p /tmp/ndk-extract
  unzip -q "$NDK_ZIP" -d /tmp/ndk-extract
  EXTRACTED=$(ls /tmp/ndk-extract/ | head -1)
  mv "/tmp/ndk-extract/$EXTRACTED" "$NDK_DIR"
  echo "  Extracted to: $NDK_DIR"
else
  echo "[2/7] NDK already extracted at $NDK_DIR"
fi

PREBUILT="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64"
CC="$PREBUILT/bin/aarch64-linux-android21-clang"
AR="$PREBUILT/bin/llvm-ar"
STRIP="$PREBUILT/bin/llvm-strip"
SYSROOT="$PREBUILT/sysroot"

echo "  CC: $CC"
"$CC" --version | head -1

# ── Step 3: Clone TinyCC ──────────────────────────────────
echo "[3/7] Cloning TinyCC..."
if [ ! -d "$SRC" ]; then
  git clone --depth=1 https://github.com/TinyCC/tinycc "$SRC"
else
  echo "  Already cloned, updating..."
  git -C "$SRC" pull --ff-only 2>/dev/null || true
fi

# ── Step 4: Configure TinyCC for aarch64-linux-android ────
echo "[4/7] Configuring TinyCC for arm64-android..."
cd "$SRC"
make distclean 2>/dev/null || true

./configure \
  --cpu=arm64 \
  --enable-cross \
  --cc="$CC" \
  --ar="$AR" \
  --extra-cflags="--sysroot=$SYSROOT -D__ANDROID_API__=21 -O2 -fPIE -fstack-protector-strong" \
  --extra-ldflags="--sysroot=$SYSROOT -pie -Wl,--gc-sections" \
  --elfinterp=/system/bin/linker64 \
  --tccdir=/data/data/com.aditech.cmaster/files/tcc \
  --libpaths=/data/data/com.aditech.cmaster/files/tcc/lib \
  --crtprefix=/data/data/com.aditech.cmaster/files/tcc/lib

# ── Step 5: Build ─────────────────────────────────────────
echo "[5/7] Building TCC binary and libtcc1.a..."
make -j$(nproc) tcc libtcc1.a 2>&1
echo "  Build done."
file ./tcc

# ── Step 6: Collect output ────────────────────────────────
echo "[6/7] Collecting output files..."
mkdir -p "$OUT/include/aarch64-linux-android" "$OUT/lib"

# TCC binary
cp ./tcc "$OUT/tcc"
"$STRIP" --strip-unneeded "$OUT/tcc" 2>/dev/null || true

# TCC support library
cp ./libtcc1.a "$OUT/libtcc1.a"

# TCC's own internal include headers
if [ -d "./include" ]; then
  cp -r ./include/. "$OUT/include/"
fi

# NDK sysroot headers needed for standard C programs
SYSROOT_INC="$SYSROOT/usr/include"
echo "  Copying NDK sysroot headers..."
for h in stdio.h stdlib.h string.h math.h stdint.h stddef.h stdbool.h \
          assert.h ctype.h errno.h float.h limits.h locale.h setjmp.h \
          signal.h stdarg.h time.h wchar.h wctype.h inttypes.h \
          complex.h fenv.h iso646.h stdalign.h stdnoreturn.h stdatomic.h \
          tgmath.h uchar.h threads.h; do
  [ -f "$SYSROOT_INC/$h" ] && cp "$SYSROOT_INC/$h" "$OUT/include/" && echo "    OK: $h" || echo "    MISSING: $h"
done

# Architecture-specific headers
if [ -d "$SYSROOT_INC/aarch64-linux-android" ]; then
  cp -r "$SYSROOT_INC/aarch64-linux-android/." "$OUT/include/aarch64-linux-android/"
fi

# sys/ headers (needed for many things)
[ -d "$SYSROOT_INC/sys" ]         && cp -r "$SYSROOT_INC/sys"         "$OUT/include/"
[ -d "$SYSROOT_INC/linux" ]       && cp -r "$SYSROOT_INC/linux"       "$OUT/include/"
[ -d "$SYSROOT_INC/asm-generic" ] && cp -r "$SYSROOT_INC/asm-generic" "$OUT/include/"
[ -d "$SYSROOT_INC/bits" ]        && cp -r "$SYSROOT_INC/bits"        "$OUT/include/"

# CRT files for compile+link mode (not needed for -run but good to have)
NDK_LIB="$SYSROOT/usr/lib/aarch64-linux-android/21"
for f in crtbegin_dynamic.o crtbegin_so.o crtend_android.o crtend_so.o; do
  [ -f "$NDK_LIB/$f" ] && cp "$NDK_LIB/$f" "$OUT/lib/" && echo "    CRT OK: $f" || echo "    CRT MISSING: $f"
done

# Copy libtcc1.a to lib as well
cp ./libtcc1.a "$OUT/lib/"

# ── Step 7: Verify ────────────────────────────────────────
echo "[7/7] Verification:"
echo "  TCC binary:"
file "$OUT/tcc"
ls -lh "$OUT/tcc"
echo "  Output structure:"
ls -la "$OUT/"
ls "$OUT/include/" | head -20
echo ""
echo "======================================================"
echo " BUILD COMPLETE. Output at: $OUT"
echo "======================================================"
