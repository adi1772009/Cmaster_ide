#!/usr/bin/env bash
set -e

NDK_DIR="/root/ndk/android-ndk-r27c"
SRC="/root/tinycc-src"
OUT="/root/tcc-arm64-out"

PREBUILT="$NDK_DIR/toolchains/llvm/prebuilt/linux-x86_64"
CC="$PREBUILT/bin/aarch64-linux-android21-clang"
AR="$PREBUILT/bin/llvm-ar"
STRIP="$PREBUILT/bin/llvm-strip"
SYSROOT="$PREBUILT/sysroot"

echo "=== [1/5] Configuring TinyCC ==="
cd "$SRC"
git reset --hard
make distclean 2>/dev/null || true

./configure \
  --cpu=arm64 \
  --enable-cross \
  --cc="$CC" \
  --ar="$AR" \
  --extra-cflags="--sysroot=$SYSROOT -D__ANDROID_API__=21 -O2 -fPIE" \
  --extra-ldflags="--sysroot=$SYSROOT -pie -Wl,--gc-sections" \
  --elfinterp=/system/bin/linker64 \
  --tccdir=/data/data/com.aditech.cmaster/files/tcc \
  --libpaths=/data/data/com.aditech.cmaster/files/tcc/lib \
  --crtprefix=/data/data/com.aditech.cmaster/files/tcc/lib

echo "=== [2/5] Building c2str with host gcc and patching Makefile ==="
gcc conftest.c -DC2STR -o c2str.exe
touch c2str.exe

# In Makefile, replace c2str build command with touch c2str.exe
sed -i 's/\$(CC) -DC2STR \$< -o \$@/touch c2str.exe/' Makefile
sed -i 's/-lpthread//g' Makefile config.mak 2>/dev/null || true

echo "=== [3/5] Compiling Target TCC Binary ==="
make tcc
"$STRIP" tcc

echo "=== [3b/5] Compiling libtcc1.a using Clang ==="
# Compile libtcc1.a runtime library directly with NDK Clang
cd lib
"$CC" -c lib-arm64.c -o lib-arm64.o -I.. -I../include --sysroot="$SYSROOT" -O2 -fPIC -fPIE -D__ANDROID_API__=21
"$CC" -c arm64-gen.c -o arm64-gen.o -I.. -I../include --sysroot="$SYSROOT" -O2 -fPIC -fPIE -D__ANDROID_API__=21 2>/dev/null || true
"$AR" rcs libtcc1.a lib-arm64.o
cd ..

echo "=== [4/5] Packaging Output Artifacts ==="
rm -rf "$OUT"
mkdir -p "$OUT/include/aarch64-linux-android" "$OUT/lib"

cp ./tcc "$OUT/tcc"
cp ./lib/libtcc1.a "$OUT/libtcc1.a"
cp ./lib/libtcc1.a "$OUT/lib/libtcc1.a"

# Copy TCC's internal headers
if [ -d "./include" ]; then
    cp -r ./include/. "$OUT/include/"
fi

# Copy NDK Sysroot headers
SYSROOT_INC="$SYSROOT/usr/include"
for h in assert.h complex.h ctype.h errno.h fenv.h float.h inttypes.h iso646.h \
         limits.h locale.h math.h setjmp.h signal.h stdalign.h stdarg.h \
         stdatomic.h stdbool.h stddef.h stdint.h stdio.h stdlib.h stdnoreturn.h \
         string.h tgmath.h threads.h time.h uchar.h wchar.h wctype.h; do
    if [ -f "$SYSROOT_INC/$h" ]; then
        cp "$SYSROOT_INC/$h" "$OUT/include/"
    fi
done

if [ -d "$SYSROOT_INC/aarch64-linux-android" ]; then
    cp -r "$SYSROOT_INC/aarch64-linux-android/." "$OUT/include/aarch64-linux-android/"
fi
[ -d "$SYSROOT_INC/sys" ] && cp -r "$SYSROOT_INC/sys" "$OUT/include/"
[ -d "$SYSROOT_INC/linux" ] && cp -r "$SYSROOT_INC/linux" "$OUT/include/"
[ -d "$SYSROOT_INC/asm-generic" ] && cp -r "$SYSROOT_INC/asm-generic" "$OUT/include/"
[ -d "$SYSROOT_INC/bits" ] && cp -r "$SYSROOT_INC/bits" "$OUT/include/"

# Copy CRT objects
NDK_LIB="$SYSROOT/usr/lib/aarch64-linux-android/21"
for f in crtbegin_dynamic.o crtbegin_so.o crtend_android.o crtend_so.o; do
    [ -f "$NDK_LIB/$f" ] && cp "$NDK_LIB/$f" "$OUT/lib/" || true
done

echo "=== [5/5] Verification ==="
file "$OUT/tcc"
ls -lh "$OUT/tcc"
echo "TCC_ARM64_SUCCESS"
