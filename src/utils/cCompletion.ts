import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'

// C Language Keywords
const C_KEYWORDS: Completion[] = [
  { label: 'auto', type: 'keyword', detail: 'storage class' },
  { label: 'break', type: 'keyword', detail: 'break statement' },
  { label: 'case', type: 'keyword', detail: 'case label' },
  { label: 'char', type: 'type', detail: 'character type (1 byte)' },
  { label: 'const', type: 'keyword', detail: 'type qualifier' },
  { label: 'continue', type: 'keyword', detail: 'continue statement' },
  { label: 'default', type: 'keyword', detail: 'default switch label' },
  { label: 'do', type: 'keyword', detail: 'do-while loop' },
  { label: 'double', type: 'type', detail: 'double precision float (8 bytes)' },
  { label: 'else', type: 'keyword', detail: 'else branch' },
  { label: 'enum', type: 'keyword', detail: 'enumeration type' },
  { label: 'extern', type: 'keyword', detail: 'external linkage' },
  { label: 'float', type: 'type', detail: 'floating point type (4 bytes)' },
  { label: 'for', type: 'keyword', detail: 'for loop' },
  { label: 'goto', type: 'keyword', detail: 'goto statement' },
  { label: 'if', type: 'keyword', detail: 'if condition' },
  { label: 'inline', type: 'keyword', detail: 'inline function specifier' },
  { label: 'int', type: 'type', detail: 'integer type (4 bytes)' },
  { label: 'long', type: 'type', detail: 'long integer modifier' },
  { label: 'register', type: 'keyword', detail: 'register storage' },
  { label: 'restrict', type: 'keyword', detail: 'restrict pointer qualifier' },
  { label: 'return', type: 'keyword', detail: 'return statement' },
  { label: 'short', type: 'type', detail: 'short integer (2 bytes)' },
  { label: 'signed', type: 'type', detail: 'signed type modifier' },
  { label: 'sizeof', type: 'keyword', detail: 'size operator' },
  { label: 'static', type: 'keyword', detail: 'static storage duration' },
  { label: 'struct', type: 'keyword', detail: 'structure definition' },
  { label: 'switch', type: 'keyword', detail: 'switch statement' },
  { label: 'typedef', type: 'keyword', detail: 'type alias definition' },
  { label: 'union', type: 'keyword', detail: 'union definition' },
  { label: 'unsigned', type: 'type', detail: 'unsigned type modifier' },
  { label: 'void', type: 'type', detail: 'empty type' },
  { label: 'volatile', type: 'keyword', detail: 'volatile qualifier' },
  { label: 'while', type: 'keyword', detail: 'while loop' },
  { label: 'bool', type: 'type', detail: 'boolean (stdbool.h)' },
  { label: 'true', type: 'constant', detail: 'boolean true (1)' },
  { label: 'false', type: 'constant', detail: 'boolean false (0)' },
  { label: 'NULL', type: 'constant', detail: 'null pointer constant ((void*)0)' },
]

// Common C Preprocessor Directives
const PREPROCESSOR_DIRECTIVES: Completion[] = [
  { label: '#include <stdio.h>', type: 'namespace', detail: 'Standard I/O header' },
  { label: '#include <stdlib.h>', type: 'namespace', detail: 'Standard library header (malloc, exit)' },
  { label: '#include <string.h>', type: 'namespace', detail: 'String manipulation header' },
  { label: '#include <math.h>', type: 'namespace', detail: 'Math library header' },
  { label: '#include <stdbool.h>', type: 'namespace', detail: 'Boolean types header' },
  { label: '#include <ctype.h>', type: 'namespace', detail: 'Character classification header' },
  { label: '#include <time.h>', type: 'namespace', detail: 'Time and date header' },
  { label: '#include <limits.h>', type: 'namespace', detail: 'Data type limits header' },
  { label: '#define', type: 'keyword', detail: 'Macro definition' },
  { label: '#ifdef', type: 'keyword', detail: 'Conditional compilation if defined' },
  { label: '#ifndef', type: 'keyword', detail: 'Conditional compilation if not defined' },
  { label: '#endif', type: 'keyword', detail: 'End conditional compilation' },
]

// Standard Library Functions
const STDLIB_FUNCTIONS: Completion[] = [
  // <stdio.h>
  { label: 'printf', type: 'function', detail: 'int printf(const char *format, ...)', info: 'Prints formatted output to stdout.' },
  { label: 'scanf', type: 'function', detail: 'int scanf(const char *format, ...)', info: 'Reads formatted input from stdin.' },
  { label: 'sprintf', type: 'function', detail: 'int sprintf(char *str, const char *format, ...)', info: 'Writes formatted output to buffer.' },
  { label: 'snprintf', type: 'function', detail: 'int snprintf(char *str, size_t size, const char *format, ...)', info: 'Writes bounded formatted output.' },
  { label: 'puts', type: 'function', detail: 'int puts(const char *str)', info: 'Writes string to stdout followed by newline.' },
  { label: 'gets', type: 'function', detail: 'char *gets(char *str)', info: 'Reads a line from stdin into buffer.' },
  { label: 'getchar', type: 'function', detail: 'int getchar(void)', info: 'Reads a character from stdin.' },
  { label: 'putchar', type: 'function', detail: 'int putchar(int c)', info: 'Writes a character to stdout.' },
  { label: 'fopen', type: 'function', detail: 'FILE *fopen(const char *fname, const char *mode)', info: 'Opens a file.' },
  { label: 'fclose', type: 'function', detail: 'int fclose(FILE *stream)', info: 'Closes an open file stream.' },
  { label: 'fgets', type: 'function', detail: 'char *fgets(char *str, int n, FILE *stream)', info: 'Reads at most n-1 characters from stream.' },
  { label: 'fputs', type: 'function', detail: 'int fputs(const char *str, FILE *stream)', info: 'Writes a string to a stream.' },
  { label: 'fprintf', type: 'function', detail: 'int fprintf(FILE *stream, const char *fmt, ...)', info: 'Prints formatted text to file.' },
  { label: 'fscanf', type: 'function', detail: 'int fscanf(FILE *stream, const char *fmt, ...)', info: 'Scans formatted input from file.' },
  { label: 'perror', type: 'function', detail: 'void perror(const char *s)', info: 'Prints an error message to stderr.' },

  // <stdlib.h>
  { label: 'malloc', type: 'function', detail: 'void *malloc(size_t size)', info: 'Allocates uninitialized memory.' },
  { label: 'calloc', type: 'function', detail: 'void *calloc(size_t num, size_t size)', info: 'Allocates zero-initialized memory.' },
  { label: 'realloc', type: 'function', detail: 'void *realloc(void *ptr, size_t new_size)', info: 'Reallocates previously allocated memory.' },
  { label: 'free', type: 'function', detail: 'void free(void *ptr)', info: 'Deallocates allocated memory.' },
  { label: 'exit', type: 'function', detail: 'void exit(int status)', info: 'Terminates process execution.' },
  { label: 'atoi', type: 'function', detail: 'int atoi(const char *str)', info: 'Converts string to integer.' },
  { label: 'atof', type: 'function', detail: 'double atof(const char *str)', info: 'Converts string to double.' },
  { label: 'atol', type: 'function', detail: 'long atol(const char *str)', info: 'Converts string to long.' },
  { label: 'rand', type: 'function', detail: 'int rand(void)', info: 'Generates pseudo-random integer.' },
  { label: 'srand', type: 'function', detail: 'void srand(unsigned int seed)', info: 'Seeds pseudo-random generator.' },
  { label: 'abs', type: 'function', detail: 'int abs(int n)', info: 'Computes absolute value of integer.' },
  { label: 'qsort', type: 'function', detail: 'void qsort(void *base, size_t nitems, size_t size, int (*compar)(const void*, const void*))', info: 'Sorts an array.' },

  // <string.h>
  { label: 'strlen', type: 'function', detail: 'size_t strlen(const char *str)', info: 'Calculates string length.' },
  { label: 'strcpy', type: 'function', detail: 'char *strcpy(char *dest, const char *src)', info: 'Copies null-terminated string.' },
  { label: 'strncpy', type: 'function', detail: 'char *strncpy(char *dest, const char *src, size_t n)', info: 'Copies bounded string.' },
  { label: 'strcat', type: 'function', detail: 'char *strcat(char *dest, const char *src)', info: 'Concatenates two strings.' },
  { label: 'strncat', type: 'function', detail: 'char *strncat(char *dest, const char *src, size_t n)', info: 'Concatenates bounded string.' },
  { label: 'strcmp', type: 'function', detail: 'int strcmp(const char *str1, const char *str2)', info: 'Compares two strings.' },
  { label: 'strncmp', type: 'function', detail: 'int strncmp(const char *str1, const char *str2, size_t n)', info: 'Compares first n characters of two strings.' },
  { label: 'strchr', type: 'function', detail: 'char *strchr(const char *str, int c)', info: 'Finds first occurrence of char in string.' },
  { label: 'strstr', type: 'function', detail: 'char *strstr(const char *haystack, const char *needle)', info: 'Finds substring.' },
  { label: 'memset', type: 'function', detail: 'void *memset(void *str, int c, size_t n)', info: 'Fills memory block with byte.' },
  { label: 'memcpy', type: 'function', detail: 'void *memcpy(void *dest, const void *src, size_t n)', info: 'Copies memory block.' },

  // <math.h>
  { label: 'sqrt', type: 'function', detail: 'double sqrt(double x)', info: 'Calculates square root.' },
  { label: 'pow', type: 'function', detail: 'double pow(double base, double exp)', info: 'Calculates base raised to exponent.' },
  { label: 'sin', type: 'function', detail: 'double sin(double x)', info: 'Computes sine of angle (radians).' },
  { label: 'cos', type: 'function', detail: 'double cos(double x)', info: 'Computes cosine of angle (radians).' },
  { label: 'tan', type: 'function', detail: 'double tan(double x)', info: 'Computes tangent of angle (radians).' },
  { label: 'floor', type: 'function', detail: 'double floor(double x)', info: 'Rounds down to nearest integer.' },
  { label: 'ceil', type: 'function', detail: 'double ceil(double x)', info: 'Rounds up to nearest integer.' },
  { label: 'fabs', type: 'function', detail: 'double fabs(double x)', info: 'Absolute value of floating point number.' },
  { label: 'log', type: 'function', detail: 'double log(double x)', info: 'Natural logarithm.' },
  { label: 'log10', type: 'function', detail: 'double log10(double x)', info: 'Base-10 logarithm.' },
]

// Interactive Snippets
const C_SNIPPETS: Completion[] = [
  snippetCompletion('int main() {\n    #{}\n    return 0;\n}', {
    label: 'main',
    detail: 'int main() { ... }',
    type: 'snippet',
  }),
  snippetCompletion('int main(int argc, char *argv[]) {\n    #{}\n    return 0;\n}', {
    label: 'mainargs',
    detail: 'int main(argc, argv) { ... }',
    type: 'snippet',
  }),
  snippetCompletion('printf("#{}\\n");', {
    label: 'printf',
    detail: 'printf("...", ...);',
    type: 'snippet',
  }),
  snippetCompletion('scanf("%#{d}", &#{var});', {
    label: 'scanf',
    detail: 'scanf("%...", &var);',
    type: 'snippet',
  }),
  snippetCompletion('for (int #{i} = 0; #{i} < #{count}; #{i}++) {\n    #{}\n}', {
    label: 'for',
    detail: 'for (int i = 0; i < n; i++)',
    type: 'snippet',
  }),
  snippetCompletion('while (#{condition}) {\n    #{}\n}', {
    label: 'while',
    detail: 'while (...) { ... }',
    type: 'snippet',
  }),
  snippetCompletion('do {\n    #{}\n} while (#{condition});', {
    label: 'do',
    detail: 'do { ... } while (...);',
    type: 'snippet',
  }),
  snippetCompletion('if (#{condition}) {\n    #{}\n}', {
    label: 'if',
    detail: 'if (...) { ... }',
    type: 'snippet',
  }),
  snippetCompletion('if (#{condition}) {\n    #{}\n} else {\n    #{}\n}', {
    label: 'ifelse',
    detail: 'if (...) { ... } else { ... }',
    type: 'snippet',
  }),
  snippetCompletion('switch (#{expression}) {\n    case #{1}:\n        #{}\n        break;\n    default:\n        break;\n}', {
    label: 'switch',
    detail: 'switch (...) { case: ... }',
    type: 'snippet',
  }),
  snippetCompletion('struct #{Name} {\n    #{}\n};', {
    label: 'struct',
    detail: 'struct Name { ... };',
    type: 'snippet',
  }),
  snippetCompletion('typedef struct {\n    #{}\n} #{Name};', {
    label: 'typedef-struct',
    detail: 'typedef struct { ... } Name;',
    type: 'snippet',
  }),
  snippetCompletion('#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    printf("#{Hello, World!}\\n");\n    return 0;\n}', {
    label: 'boilerplate',
    detail: 'Complete starter C program',
    type: 'snippet',
  }),
]

// Extract user-defined identifiers from the current editor document
function getDocumentIdentifiers(docText: string, currentWord: string): Completion[] {
  const words = new Set<string>()
  const idRegex = /\b[a-zA-Z_][a-zA-Z0-9_]{1,40}\b/g
  let match: RegExpExecArray | null

  while ((match = idRegex.exec(docText)) !== null) {
    const w = match[0]
    if (w !== currentWord && w.length >= 2) {
      words.add(w)
    }
  }

  return Array.from(words).map(w => ({
    label: w,
    type: 'variable',
    detail: 'identifier in file',
  }))
}

// Custom C completion source
export function cCompletionSource(context: CompletionContext): CompletionResult | null {
  // Check word before cursor or preprocessor '#'
  const word = context.matchBefore(/#[a-zA-Z_0-9]*|[a-zA-Z_][a-zA-Z0-9_]*/)
  if (!word && !context.explicit) return null
  if (word && word.from === word.to && !context.explicit) return null

  const from = word ? word.from : context.pos
  const wordText = word ? word.text : ''

  // Collect completions
  const docText = context.state.doc.toString()
  const docIdentifiers = getDocumentIdentifiers(docText, wordText)

  const allCompletions: Completion[] = [
    ...C_SNIPPETS,
    ...PREPROCESSOR_DIRECTIVES,
    ...C_KEYWORDS,
    ...STDLIB_FUNCTIONS,
    ...docIdentifiers,
  ]

  return {
    from,
    options: allCompletions,
    validFor: /^#?[a-zA-Z_0-9]*$/,
  }
}

// Extension builder that enables or disables autocompletion
export function createCCompletionExtension(enabled: boolean) {
  if (!enabled) return []
  return autocompletion({
    override: [cCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 30,
    defaultKeymap: true,
  })
}
