# How to use this file
Paste everything below the line into Antigravity's task box, or drop this whole file into your project root (e.g. `docs/AGENT_BRIEF.md`) and tell Antigravity: "Read AGENT_BRIEF.md and execute it phase by phase." Either way works — the brief below is self-contained.

Before you hand it over, fill in the two `[FILL IN: ...]` placeholders in Phase 0 with the actual paths to your two support files (the required-headers file and the 56-problems file), and place them somewhere inside the project folder Antigravity has open, so it can actually read them.

---

# AGENT BRIEF: TinyCC Integration for an Android C IDE

You are an autonomous coding agent working inside an existing Android Studio project. This document is your full task specification. Read the entire brief before taking any action. Work through the phases in order — each phase has an **Acceptance Criteria** section, and you must not move to the next phase until the current one's criteria are genuinely verified, not merely assumed from a "build succeeded" message.

## Project context

The workspace you have open already contains a **fully built, custom Android UI** for a C-language IDE app (code editor view, a Run/Compile control, and — if not already present — a console/output area). This UI is finished and should not be redesigned, restyled, or rewritten. Your job is purely to make it functional: wire it up to a real C compiler so that code typed into the editor actually compiles and runs on the device.

The compiler to use is **TinyCC (TCC)** — a small, fast, ISO-C-compliant compiler. It is not currently part of this project. You must obtain it, cross-compile it for Android yourself, and integrate it. The person you're working for should not need to manually download or build anything.

Two additional reference files exist for validating your work once integration is done:

1. A **required-headers file** — a plain text/spec file listing which standard C header files the finished IDE must be able to `#include` successfully.
2. A **problem-set file** — a plain text file listing **56 programming problems**. The compiler integration is only considered trustworthy for student use once code solving all 56 of these compiles and runs correctly through the app's real pipeline (not shortcuts on the host machine).

## Inputs available to you

- The existing Android UI project (already open as your workspace — inspect it before writing anything).
- Required-headers file: `[FILL IN: path to the header-requirements text file]`
- Problem-set file: `[FILL IN: path to the 56-problems text file]`

**If either of these two files cannot be found at the given path, stop and ask the user where they are — do not guess their contents or invent your own list.**

## Constraints and non-goals

- Do **not** change the visual design, layout, colors, or component structure of the existing UI, with exactly one exception: resize the terminal/console output view so it occupies roughly **60–70% of the screen**. Every other element keeps its current design, position, and styling. Only add the functionality described below, matching the existing code's naming conventions and architecture.
- Do **not** report a phase as complete without the on-device evidence its Acceptance Criteria section asks for. A successful compile log on the host machine is not sufficient proof that something works on an Android device.
- Do **not** fabricate or estimate results for the 56-problem validation — every one of them must actually be run through the app's real compile-and-execute path.
- Prefer the **arm64-v8a** ABI first, since it covers the overwhelming majority of real Android devices. Add `armeabi-v7a` and `x86_64` afterward only if time allows — this is a nice-to-have, not a blocker.
- If a step requires downloading a tool, running a shell command with side effects, or anything irreversible, surface it for approval before running rather than proceeding silently.
- If you get stuck or a build fails in a way this brief didn't anticipate, stop and report the specific error rather than working around it with a fallback that changes the intended behavior.

---

## Phase 0 — Orientation

**Goal:** Understand what already exists before touching anything.

**Actions:**
- Inspect the existing project structure: identify the code editor component, the Run/Compile button and its click handler, any existing console/output view, the app's package name, `minSdkVersion`, Gradle and Android Gradle Plugin versions.
- Locate and read the required-headers file and the problem-set file referenced above.

**Acceptance criteria:** Produce a short written summary (a few sentences) of what you found — the UI's key components and file locations, and confirmation both reference files were located and read — before starting Phase 1.

---

## Phase 1 — Acquire and cross-compile TinyCC

**Goal:** Get a working `tcc` binary that runs on an Android device, without the user downloading or building anything by hand.

**Actions:**
- Clone TinyCC's source from `https://github.com/TinyCC/tinycc` (mirror of the canonical `https://repo.or.cz/tinycc.git`) into a build-only folder outside the shipped app source, e.g. `tools/tinycc-src/`.
- Ensure the Android NDK is available (install via `sdkmanager` if the project's SDK setup allows it, or download from `https://developer.android.com/ndk/downloads`). Note the NDK path for reuse in later steps.
- For the `arm64-v8a` ABI:
  - Use the NDK's `clang` for that ABI as the cross-compiler.
  - Configure TCC's build with the cross-prefix pointed at that clang, and set `--elfinterp` to `/system/bin/linker64` (the correct Android dynamic linker path for 64-bit ABIs).
  - Build the `tcc` executable and `libtcc1.a` using that ABI's NDK sysroot include paths.
- Repeat for `armeabi-v7a` and `x86_64` only after arm64-v8a is fully verified, using `/system/bin/linker` for the 32-bit ABI.

**Acceptance criteria:** Push the resulting `tcc` binary to a connected device or emulator (`adb push`), run it directly (`adb shell`), and successfully compile and execute a one-line "hello world" `.c` file **on the device itself**. Do not proceed to Phase 2 on the strength of a host-machine build log alone.

---

## Phase 2 — Package TCC into the app

**Goal:** Get the verified binary and its support files shipping inside the APK correctly.

**Actions:**
- Rename the arm64-v8a `tcc` binary to `libtcc_bin.so` and place it at `app/src/main/jniLibs/arm64-v8a/libtcc_bin.so` (Android extracts files from `jniLibs` as executable automatically, avoiding newer Android versions' restrictions on executing files extracted from `assets`). Repeat per additional ABI folder if you built more than one.
- Place `libtcc1.a` and TCC's bundled include headers under `app/src/main/assets/tcc/lib/` and `app/src/main/assets/tcc/include/` respectively.
- Add first-launch extraction logic into the app's existing startup code: on launch, copy the `assets/tcc` contents into `context.filesDir/tcc/` if not already present there, without disturbing unrelated startup logic.

**Acceptance criteria:** Cold-launch the updated app on-device and confirm, via logs or a debug check, that `filesDir/tcc/lib/` and `filesDir/tcc/include/` are correctly populated after first launch.

---

## Phase 3 — Wire compile-and-run into the existing UI as a real, interactive terminal

**Goal:** Make the Run/Compile button in the existing UI actually compile and execute whatever the user typed, in a console that behaves exactly like a live terminal session — not a form the user fills in ahead of time.

**Actions:**
- Resize the existing console/output view (add a minimal one if the UI doesn't already have one) so it occupies roughly **60–70% of the screen** when a program is running. This is the one layout change permitted anywhere in this brief — no other element moves, resizes, or restyles.
- Find the existing Run/Compile button's handler and inject this behavior:
  - Take the current editor buffer's text and write it to a temp `.c` file in the app's private storage.
  - Launch the bundled binary (path: `context.applicationInfo.nativeLibraryDir + "/libtcc_bin.so"`) via `ProcessBuilder`, passing `-B <extracted-lib-path>` and `-I <extracted-include-path>`, using either `-run` for immediate in-place execution or a compile-then-execute two-step.
  - Read the process's stdout and stderr continuously on a background thread and append each chunk to the terminal view **as it arrives**, not after the process finishes.
  - Give the terminal view its own live text-input row (like a real terminal prompt), always available while the process is running — not a separate "enter all your inputs" panel and not a dialog collected before execution starts.
- **Critical correction from a previous project — read carefully:** Do **not** implement input by collecting all expected inputs in advance and feeding them to the process's stdin as one batch before it starts running. That approach was tried before, it did not feel interactive, and it must not be repeated. Instead:
  - The program runs and produces output normally until it hits a blocking read (e.g. `scanf`, `fgets`).
  - At that exact point, the user types their response directly into the terminal's input row, in the moment, the same way they would in a real terminal emulator.
  - When they submit it (e.g. tap Send / press Enter), that text is written to the process's stdin stream and flushed immediately, execution resumes, and further output continues appending to the same scrolling view.
  - This must support a program that prompts for input more than once during a single run, with output and input naturally interleaved in the same view, in the order they actually occurred.
- Add a watchdog that terminates the process (`Process.destroy()`) after roughly 8–10 seconds of no new output **and no pending prompt for input** — don't let the timeout fire while the terminal is legitimately just waiting on the user to type something. Wire a visible Stop control to the same call, so a genuinely runaway or infinite-loop program can still be killed.

**Acceptance criteria:**
- Confirm the console occupies roughly 60–70% of the screen during execution, with nothing else in the UI changed.
- Run, in order, and confirm correct output for each: a hello-world print, a `for` loop, a recursive factorial function, and a recursive Tower of Hanoi solver.
- Then run a program that calls `scanf` at least twice at different points (for example, prompts for a name, prints a greeting, then prompts for a number and prints something based on it). Confirm: output appears up to each prompt before you type anything, you can type your answer directly into the terminal's input row at that moment, submitting it resumes execution, and the next round of output appears correctly. If this instead requires typing all answers before pressing Run, the implementation is wrong and must be redone.

---

## Phase 4 — Map compiler errors back into the editor

**Goal:** Make compile errors feel native to the IDE instead of raw terminal text.

**Actions:**
- Parse TCC's `filename.c:LINE: error: message` pattern out of captured stderr.
- When an error is reported, highlight or auto-scroll the code editor to the matching line number.

**Acceptance criteria:** Intentionally introduce a syntax error in a test program and confirm the UI correctly highlights the offending line.

---

## Phase 5 — Header coverage check

**Goal:** Confirm the compiler actually supports every header the required-headers file says it must.

**Actions:**
- Read through the required-headers file located in Phase 0.
- For each header it lists, compile a minimal test file that does nothing but `#include` that header, using the full on-device pipeline built in Phase 3, and confirm it compiles cleanly.
- Build a table of results: header name → fully supported / missing / partially supported (compiles but a specific function or macro is unavailable). Do not silently patch around a missing header or omit it from the report — list it plainly.

**Acceptance criteria:** A written header-coverage report exists in the project (e.g. `docs/header_coverage_report.md`) listing every header from the required-headers file and its status, before starting Phase 6.

---

## Phase 6 — Run the full 56-problem validation suite

**Goal:** Prove the compiler integration is solid enough for real student use.

**Actions:**
- Read the problem-set file located in Phase 0.
- For each of the 56 problems: use the provided source/test case if the file already includes one, or otherwise write a correct C solution for it. Run each one through the actual app pipeline exactly as a student would — type/load it, hit Run, capture the real output — not a shortcut compiled on the host machine.
- Record a pass/fail result for every problem, including the actual output produced versus the expected output for any failures, in a report (e.g. `docs/validation_report.md`).

**Acceptance criteria:** The integration is only considered complete once all 56 problems have been run through the real on-device pipeline and their results recorded. Any failing problems must be listed individually with their specific error — never rounded up to "mostly passing."

---

## Phase 7 — Final report

**Goal:** Hand back a clear summary of what was built and what, if anything, is still incomplete.

**Actions:** Write a short final report covering:
- Which ABIs were successfully built (arm64-v8a required; others as a bonus).
- The header coverage results from Phase 5.
- The validation pass rate from Phase 6, with any failures called out.
- Any known limitations — for example, C standard features TCC doesn't implement, or headers it can't fully support.

---

## Standing rules (apply throughout every phase)

- Never ask the user to manually download, build, or install TCC — you do that yourself in Phase 1.
- Never claim a phase is done without the on-device evidence its Acceptance Criteria section requires.
- Never modify the existing UI's look, layout, or component structure, except resizing the console to roughly 60–70% of the screen as specified in Phase 3.
- Never implement program input as a batch of values collected before execution starts. Input must be typed live, at the moment the running program actually asks for it, the way a real terminal works.
- Never skip straight from "it compiled on my machine" to the next phase — every acceptance check in this brief is specifically about behavior on an actual Android device or emulator.
- If a required file, path, tool, or detail mentioned in this brief is missing or ambiguous, stop and ask rather than guessing or inventing a substitute.
