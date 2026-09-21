import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

const C_KEYWORDS = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while', 'bool', 'true', 'false', 'NULL'
]

const C_STDLIB_FUNCTIONS = [
  { label: 'printf', detail: 'int printf(const char *format, ...)', type: 'function', info: 'Prints formatted output to stdout' },
  { label: 'scanf', detail: 'int scanf(const char *format, ...)', type: 'function', info: 'Reads formatted input from stdin' },
  { label: 'sprintf', detail: 'int sprintf(char *str, const char *format, ...)', type: 'function', info: 'Writes formatted output to string' },
  { label: 'sscanf', detail: 'int sscanf(const char *str, const char *format, ...)', type: 'function', info: 'Reads formatted input from string' },
  { label: 'malloc', detail: 'void* malloc(size_t size)', type: 'function', info: 'Allocates dynamic memory' },
  { label: 'calloc', detail: 'void* calloc(size_t num, size_t size)', type: 'function', info: 'Allocates zero-initialized memory' },
  { label: 'realloc', detail: 'void* realloc(void *ptr, size_t new_size)', type: 'function', info: 'Reallocates dynamic memory' },
  { label: 'free', detail: 'void free(void *ptr)', type: 'function', info: 'Deallocates dynamic memory' },
  { label: 'exit', detail: 'void exit(int status)', type: 'function', info: 'Terminates process with status' },
  { label: 'abs', detail: 'int abs(int n)', type: 'function', info: 'Absolute value of integer' },
  { label: 'qsort', detail: 'void qsort(void *base, size_t nitems, size_t size, int (*compar)(const void*, const void*))', type: 'function', info: 'Quick sort array' },
  { label: 'strlen', detail: 'size_t strlen(const char *str)', type: 'function', info: 'Returns string length' },
  { label: 'strcpy', detail: 'char* strcpy(char *dest, const char *src)', type: 'function', info: 'Copies source string to destination' },
  { label: 'strncpy', detail: 'char* strncpy(char *dest, const char *src, size_t n)', type: 'function', info: 'Copies up to n characters' },
  { label: 'strcmp', detail: 'int strcmp(const char *s1, const char *s2)', type: 'function', info: 'Compares two strings' },
  { label: 'strncmp', detail: 'int strncmp(const char *s1, const char *s2, size_t n)', type: 'function', info: 'Compares up to n characters' },
  { label: 'strcat', detail: 'char* strcat(char *dest, const char *src)', type: 'function', info: 'Concatenates strings' },
  { label: 'strchr', detail: 'char* strchr(const char *s, int c)', type: 'function', info: 'Finds first occurrence of char' },
  { label: 'strstr', detail: 'char* strstr(const char *haystack, const char *needle)', type: 'function', info: 'Finds substring' },
  { label: 'memcpy', detail: 'void* memcpy(void *dest, const void *src, size_t n)', type: 'function', info: 'Copies memory buffer' },
  { label: 'memset', detail: 'void* memset(void *s, int c, size_t n)', type: 'function', info: 'Fills memory buffer with byte' },
  { label: 'sqrt', detail: 'double sqrt(double x)', type: 'function', info: 'Computes square root' },
  { label: 'pow', detail: 'double pow(double base, double exp)', type: 'function', info: 'Raises base to power of exp' },
  { label: 'sin', detail: 'double sin(double x)', type: 'function', info: 'Computes sine of angle (radians)' },
  { label: 'cos', detail: 'double cos(double x)', type: 'function', info: 'Computes cosine of angle (radians)' },
  { label: 'tan', detail: 'double tan(double x)', type: 'function', info: 'Computes tangent of angle (radians)' },
  { label: 'ceil', detail: 'double ceil(double x)', type: 'function', info: 'Rounds up to nearest integer' },
  { label: 'floor', detail: 'double floor(double x)', type: 'function', info: 'Rounds down to nearest integer' },
]

const C_SNIPPETS = [
  {
    label: 'main',
    detail: 'int main() { ... }',
    type: 'snippet',
    apply: 'int main() {\n    printf("Hello, World!\\n");\n    return 0;\n}'
  },
  {
    label: 'for',
    detail: 'for (int i = 0; i < n; i++)',
    type: 'snippet',
    apply: 'for (int i = 0; i < n; i++) {\n    \n}'
  },
  {
    label: 'while',
    detail: 'while (condition) { ... }',
    type: 'snippet',
    apply: 'while () {\n    \n}'
  },
  {
    label: 'if',
    detail: 'if (condition) { ... }',
    type: 'snippet',
    apply: 'if () {\n    \n}'
  },
  {
    label: 'ifelse',
    detail: 'if ... else ...',
    type: 'snippet',
    apply: 'if () {\n    \n} else {\n    \n}'
  },
  {
    label: 'struct',
    detail: 'struct Name { ... };',
    type: 'snippet',
    apply: 'struct Node {\n    int data;\n    struct Node* next;\n};'
  },
  {
    label: 'swap',
    detail: 'void swap(int *a, int *b)',
    type: 'snippet',
    apply: 'void swap(int* a, int* b) {\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}'
  },
  {
    label: 'inc_stdio',
    detail: '#include <stdio.h>',
    type: 'snippet',
    apply: '#include <stdio.h>\n'
  },
  {
    label: 'inc_stdlib',
    detail: '#include <stdlib.h>',
    type: 'snippet',
    apply: '#include <stdlib.h>\n'
  },
  {
    label: 'inc_string',
    detail: '#include <string.h>',
    type: 'snippet',
    apply: '#include <string.h>\n'
  },
  {
    label: 'inc_stdbool',
    detail: '#include <stdbool.h>',
    type: 'snippet',
    apply: '#include <stdbool.h>\n'
  },
  {
    label: 'inc_math',
    detail: '#include <math.h>',
    type: 'snippet',
    apply: '#include <math.h>\n'
  }
]

export function cCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[a-zA-Z_#][a-zA-Z0-9_]*/)
  if (!word && !context.explicit) return null

  const from = word ? word.from : context.pos

  // Collect identifiers dynamically from document buffer
  const docText = context.state.doc.toString()
  const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g
  const docWords = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = identifierRegex.exec(docText)) !== null) {
    if (match[0].length > 1 && !C_KEYWORDS.includes(match[0])) {
      docWords.add(match[0])
    }
  }

  const options: Array<{ label: string; type?: string; detail?: string; info?: string; apply?: string; boost?: number }> = []

  // 1. Snippets
  for (const snip of C_SNIPPETS) {
    options.push({ ...snip, boost: 3 })
  }

  // 2. Stdlib Functions
  for (const fn of C_STDLIB_FUNCTIONS) {
    options.push({ ...fn, boost: 2 })
  }

  // 3. Keywords
  for (const kw of C_KEYWORDS) {
    options.push({ label: kw, type: 'keyword', boost: 1 })
  }

  // 4. Document symbols
  for (const id of docWords) {
    options.push({ label: id, type: 'variable', boost: 0 })
  }

  return {
    from,
    options,
    validFor: /^[a-zA-Z_#][a-zA-Z0-9_]*$/
  }
}

export const cCompletionExtension = autocompletion({
  override: [cCompletionSource],
  defaultKeymap: true,
  icons: true,
})
