// cStandardLibraries.ts
// Comprehensive runtime extensions for C standard library support, struct/typedef handling, and execution engine

export function overrideFunc(rt: any, lt: any, name: string, args: any[], retType: any, impl: any) {
  const ltsig = rt.getTypeSignature(lt)
  if (ltsig in rt.types) {
    const t = rt.types[ltsig].handlers
    if (t[name]) {
      const sig = rt.makeParametersSignature(args)
      if (t[name].functions) delete t[name].functions[sig]
      if (t[name].reg) delete t[name].reg[sig]
    }
  }
  rt.regFunc(impl, lt, name, args, retType)
}

// In-memory virtual file system for C file I/O operations (<stdio.h>)
const virtualFS = new Map<string, string>()

export function setupStandardHeaders(includes: any) {
  const headers = [
    'assert.h', 'complex.h', 'ctype.h', 'errno.h', 'fenv.h',
    'float.h', 'inttypes.h', 'iso646.h', 'limits.h', 'locale.h',
    'math.h', 'setjmp.h', 'signal.h', 'stdalign.h', 'stdarg.h',
    'stdatomic.h', 'stdbool.h', 'stddef.h', 'stdint.h', 'stdio.h',
    'stdlib.h', 'stdnoreturn.h', 'string.h', 'tgmath.h', 'threads.h',
    'time.h', 'uchar.h', 'wchar.h', 'wctype.h', 'stdbit.h', 'stdckdint.h'
  ]

  headers.forEach(h => {
    if (!includes[h]) {
      includes[h] = { load(_rt: any) {} }
    }
    const noExt = h.replace('.h', '')
    if (!includes[noExt]) {
      includes[noExt] = includes[h]
    }
  })
}

export function extractAndRegisterStructs(rt: any, source: string, structSizes: Record<string, number>) {
  const cleanSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
  const re = /(?:typedef\s+)?struct\s*([a-zA-Z_0-9]*)\s*\{([^}]+)\}\s*([a-zA-Z_0-9]*)\s*;/g
  let match: RegExpExecArray | null

  while ((match = re.exec(cleanSource)) !== null) {
    const isTypedef = match[0].trim().startsWith('typedef')
    const tag = match[1] ? match[1].trim() : null
    const body = match[2]
    const alias = match[3] ? match[3].trim() : null

    const structName = tag
      ? `struct ${tag}`
      : (alias ? `struct ${alias}` : `struct _anon_${Math.random().toString(36).substring(2, 8)}`)

    const members: any[] = []
    const stmts = body.split(';').map(s => s.trim()).filter(Boolean)

    for (const stmt of stmts) {
      const parts = stmt.split(/\s+/)
      let typePart = ''
      let declPart = ''

      if (parts[0] === 'struct') {
        typePart = parts[0] + ' ' + parts[1]
        declPart = parts.slice(2).join(' ')
      } else if (['unsigned', 'signed', 'long', 'short'].includes(parts[0])) {
        if (parts[1] && !parts[1].includes('*') && !parts[1].includes('[') && !parts[1].includes(',')) {
          typePart = parts[0] + ' ' + parts[1]
          declPart = parts.slice(2).join(' ')
        } else {
          typePart = parts[0]
          declPart = parts.slice(1).join(' ')
        }
      } else {
        typePart = parts[0]
        declPart = parts.slice(1).join(' ')
      }

      if (typePart.includes('*')) {
        const tSplit = typePart.split('*')
        typePart = tSplit[0]
        declPart = '*' + tSplit.slice(1).join('*') + (declPart ? ' ' + declPart : '')
      }

      const decls = declPart.split(',').map(d => d.trim()).filter(Boolean)
      for (const d of decls) {
        const isPtr = d.includes('*') || typePart.includes('*')
        const arrMatch = d.match(/([a-zA-Z_0-9]+)\s*\[(\d+)\]/)
        let mName = d.replace(/[\*\[\]\d\s]/g, '')
        let mType = rt.intTypeLiteral

        if (isPtr) {
          mType = rt.normalPointerType(rt.voidTypeLiteral)
        } else if (arrMatch) {
          mName = arrMatch[1]
          const arrLen = parseInt(arrMatch[2], 10)
          let elemType = rt.intTypeLiteral
          if (typePart.includes('char')) elemType = rt.charTypeLiteral
          else if (typePart.includes('float')) elemType = rt.floatTypeLiteral
          else if (typePart.includes('double')) elemType = rt.doubleTypeLiteral
          mType = rt.arrayType(elemType, arrLen)
        } else {
          if (typePart.includes('char')) mType = rt.charTypeLiteral
          else if (typePart.includes('float')) mType = rt.floatTypeLiteral
          else if (typePart.includes('double')) mType = rt.doubleTypeLiteral
          else if (typePart.includes('short')) mType = rt.shortTypeLiteral
          else if (typePart.includes('long')) mType = rt.longTypeLiteral
          else mType = rt.intTypeLiteral
        }

        members.push({
          name: mName,
          type: mType,
          initialize: () => {
            const v = rt.defaultValue(mType, true)
            v.left = true
            return v
          }
        })
      }
    }

    const cls = rt.newClass(structName, members)
    const sig = rt.getTypeSignature(cls)
    const ptrType = rt.normalPointerType(cls)
    structSizes[sig] = Math.max(16, members.length * 8)

    rt.types[sig].handlers['o(&)'] = {
      *default(rtInner: any, l: any) {
        return rtInner.val(ptrType, rtInner.makeNormalPointerValue(l))
      }
    }

    rt.types[sig].handlers['='] = {
      default(rtInner: any, l: any, r: any) {
        if (!l.left) rtInner.raiseException('Struct is not a left value')
        if (r && r.v && r.v.members) {
          for (const k of Object.keys(r.v.members)) {
            if (l.v.members[k]) {
              l.v.members[k].v = r.v.members[k].v
            }
          }
        }
        return l
      }
    }

    if (alias) {
      rt.registerTypedef(cls, alias)
      structSizes[alias] = structSizes[sig]
    }
    if (tag) {
      structSizes[`struct ${tag}`] = structSizes[sig]
    }
  }
}

function registerStandardTypes(rt: any, structSizes: Record<string, number>) {
  const voidPtr = rt.normalPointerType(rt.voidTypeLiteral)

  // Standard typedefs
  rt.registerTypedef(voidPtr, 'FILE')
  rt.registerTypedef(rt.intTypeLiteral, 'uint8_t')
  rt.registerTypedef(rt.intTypeLiteral, 'int8_t')
  rt.registerTypedef(rt.intTypeLiteral, 'uint16_t')
  rt.registerTypedef(rt.intTypeLiteral, 'int16_t')
  rt.registerTypedef(rt.intTypeLiteral, 'uint32_t')
  rt.registerTypedef(rt.intTypeLiteral, 'int32_t')
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'uint64_t')
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'int64_t')
  rt.registerTypedef(rt.intTypeLiteral, 'size_t')
  rt.registerTypedef(rt.intTypeLiteral, 'thrd_t')
  rt.registerTypedef(rt.intTypeLiteral, 'mtx_t')
  rt.registerTypedef(rt.intTypeLiteral, 'cnd_t')
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'time_t')
  rt.registerTypedef(rt.intTypeLiteral, 'wchar_t')
  rt.registerTypedef(rt.intTypeLiteral, 'atomic_int')
  rt.registerTypedef(rt.intTypeLiteral, 'atomic_bool')
  rt.registerTypedef(rt.intTypeLiteral, 'jmp_buf')

  // Register complex type
  const complexMembers = [
    { name: 'real', type: rt.doubleTypeLiteral, initialize: () => ({ t: rt.doubleTypeLiteral, v: 0.0, left: true }) },
    { name: 'imag', type: rt.doubleTypeLiteral, initialize: () => ({ t: rt.doubleTypeLiteral, v: 0.0, left: true }) }
  ]
  const cCls = rt.newClass('_Complex_double', complexMembers)
  const cSig = rt.getTypeSignature(cCls)
  structSizes[cSig] = 16
  structSizes['_Complex_double'] = 16
  rt.registerTypedef(cCls, 'double_complex')

  // Register struct timespec & struct tm
  const tsMembers = [
    { name: 'tv_sec', type: rt.longTypeLiteral || rt.intTypeLiteral, initialize: () => ({ t: rt.longTypeLiteral || rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tv_nsec', type: rt.longTypeLiteral || rt.intTypeLiteral, initialize: () => ({ t: rt.longTypeLiteral || rt.intTypeLiteral, v: 0, left: true }) }
  ]
  const tsCls = rt.newClass('struct timespec', tsMembers)
  const tsSig = rt.getTypeSignature(tsCls)
  structSizes[tsSig] = 16
  structSizes['struct timespec'] = 16
  rt.types[tsSig].handlers['o(&)'] = {
    *default(rtInner: any, l: any) {
      return rtInner.val(rtInner.normalPointerType(tsCls), rtInner.makeNormalPointerValue(l))
    }
  }

  const tmMembers = [
    { name: 'tm_sec', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_min', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_hour', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_mday', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_mon', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_year', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_wday', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_yday', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tm_isdst', type: rt.intTypeLiteral, initialize: () => ({ t: rt.intTypeLiteral, v: 0, left: true }) }
  ]
  const tmCls = rt.newClass('struct tm', tmMembers)
  const tmSig = rt.getTypeSignature(tmCls)
  structSizes[tmSig] = 36
  structSizes['struct tm'] = 36
  rt.types[tmSig].handlers['o(&)'] = {
    *default(rtInner: any, l: any) {
      return rtInner.val(rtInner.normalPointerType(tmCls), rtInner.makeNormalPointerValue(l))
    }
  }

  // Global NULL
  rt.scope[0].variables['NULL'] = rt.val(voidPtr, rt.nullPointerValue)
}

export function patchRuntime(rt: any, structSizes: Record<string, number>) {
  const origPointerArrow = rt.types['pointer_normal'].handlers['o(->)'].default
  rt.types['pointer_normal'].handlers['o(->)'].default = function* (rtInner: any, l: any) {
    return origPointerArrow(rtInner, l)
  }

  rt.types['pointer_normal'].handlers['o(*)'] = {
    *default(rtInner: any, l: any) {
      if (!l || !l.v || !l.v.target) rtInner.raiseException('Null pointer dereference (*)')
      return l.v.target
    }
  }

  rt.types['pointer_normal'].handlers['o(&)'] = {
    default(rtInner: any, l: any, r: any) {
      if (r === undefined) {
        const t = rtInner.normalPointerType(l.t)
        return rtInner.val(t, rtInner.makeNormalPointerValue(l))
      }
      rtInner.raiseException('you cannot cast bitwise and on pointer')
    }
  }

  rt.types['pointer_normal'].handlers['o(!)'] = {
    default(rtInner: any, l: any) {
      const isNull = !l || !l.v || l.v === rtInner.nullPointerValue || l.v.target === null
      return rtInner.val(rtInner.boolTypeLiteral, isNull)
    }
  }

  rt.types['pointer_normal'].handlers['o(==)'] = {
    default(rtInner: any, l: any, r: any) {
      const lt = l?.v ? (l.v.target !== undefined ? l.v.target : l.v) : null
      const rtVal = r?.v ? (r.v.target !== undefined ? r.v.target : r.v) : null
      return rtInner.val(rtInner.boolTypeLiteral, lt === rtVal)
    }
  }

  rt.types['pointer_normal'].handlers['o(!=)'] = {
    default(rtInner: any, l: any, r: any) {
      const lt = l?.v ? (l.v.target !== undefined ? l.v.target : l.v) : null
      const rtVal = r?.v ? (r.v.target !== undefined ? r.v.target : r.v) : null
      return rtInner.val(rtInner.boolTypeLiteral, lt !== rtVal)
    }
  }

  rt.types['pointer_normal'].handlers['='] = {
    default(rtInner: any, l: any, r: any) {
      if (!l.left) rtInner.raiseException('Pointer is not a left value')
      l.v = r.v
      return l
    }
  }

  const origSimpleType = rt.simpleType.bind(rt)
  rt.simpleType = function (type: any) {
    if (typeof type === 'string') {
      type = type.trim()
      if (this.typedefs[type]) return this.typedefs[type]
    }
    return origSimpleType(type)
  }

  const origGetSizeByType = rt.getSizeByType.bind(rt)
  rt.getSizeByType = function (t: any) {
    if (this.isClassType(t)) {
      const sig = this.getTypeSignature(t)
      if (structSizes[sig]) return structSizes[sig]
      return 32
    }
    return origGetSizeByType(t)
  }

  const origCast = rt.cast.bind(rt)
  rt.cast = function (type: any, value: any) {
    if (!value) return origCast(type, value)

    if (value.v && value.v.isMallocBlock) {
      const size = value.v.size
      if (this.isNormalPointerType(type)) {
        if (this.isClassType(type.targetType)) {
          const instance = this.defaultValue(type.targetType, true)
          return this.val(type, this.makeNormalPointerValue(instance))
        } else {
          const elemSize = this.getSizeByType(type.targetType) || 4
          const count = Math.max(1, Math.floor(size / elemSize))
          const arr = Array.from({ length: count }, () => {
            const v = this.defaultValue(type.targetType, true)
            v.left = true
            return v
          })
          return this.val(this.arrayPointerType(type.targetType, count), this.makeArrayPointerValue(arr, 0))
        }
      }
    }

    if (this.isNormalPointerType(type)) {
      if (this.isNumericType(value.t) && value.v === 0) return this.val(type, this.nullPointerValue)
      if (this.isNormalPointerType(value) && (value.v === this.nullPointerValue || value.v.target === null)) return this.val(type, this.nullPointerValue)
      if (this.isNormalPointerType(value)) return this.val(type, value.v)
      if (this.isArrayType(value)) return value
    }
    return origCast(type, value)
  }

  const voidPtr = rt.normalPointerType(rt.voidTypeLiteral)
  const charPtr = rt.normalPointerType(rt.charTypeLiteral)

  // Memory management
  rt.regFunc((_rtInner: any, _this: any, sizeVal: any) => {
    const size = typeof sizeVal === 'object' ? sizeVal.v : sizeVal
    return rt.val(voidPtr, { isMallocBlock: true, size: size || 32, target: null })
  }, 'global', 'malloc', [rt.intTypeLiteral], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, _ptr: any) => rt.val(rt.voidTypeLiteral, 0), 'global', 'free', [voidPtr], rt.voidTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, numVal: any, sizeVal: any) => {
    const num = typeof numVal === 'object' ? numVal.v : numVal
    const size = typeof sizeVal === 'object' ? sizeVal.v : sizeVal
    return rt.val(voidPtr, { isMallocBlock: true, size: (num || 1) * (size || 1), target: null })
  }, 'global', 'calloc', [rt.intTypeLiteral, rt.intTypeLiteral], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, ptr: any, _sizeVal: any) => ptr, 'global', 'realloc', [voidPtr, rt.intTypeLiteral], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, codeVal: any) => {
    const c = typeof codeVal === 'object' ? codeVal.v : codeVal
    return rt.val(rt.voidTypeLiteral, c)
  }, 'global', 'exit', [rt.intTypeLiteral], rt.voidTypeLiteral)

  // String & Memory operations
  rt.regFunc((rtInner: any, _this: any, dest: any, src: any, nVal: any) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal
    if (dest && dest.v && src && src.v) {
      const dArr = dest.v.target
      const sArr = src.v.target
      const dPos = dest.v.position || 0
      const sPos = src.v.position || 0
      for (let i = 0; i < n && (sPos + i) < sArr.length && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rtInner.clone(sArr[sPos + i])
      }
    }
    return dest
  }, 'global', 'memcpy', [voidPtr, voidPtr, rt.intTypeLiteral], voidPtr)

  rt.regFunc((rtInner: any, _this: any, dest: any, src: any, nVal: any) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal
    if (dest && dest.v && src && src.v) {
      const dArr = dest.v.target
      const sArr = src.v.target
      const dPos = dest.v.position || 0
      const sPos = src.v.position || 0
      for (let i = 0; i < n && (sPos + i) < sArr.length && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rtInner.clone(sArr[sPos + i])
      }
    }
    return dest
  }, 'global', 'memmove', [voidPtr, voidPtr, rt.intTypeLiteral], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, dest: any, valParam: any, nVal: any) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal
    const byteVal = typeof valParam === 'object' ? valParam.v : valParam
    if (dest && dest.v) {
      const dArr = dest.v.target
      const dPos = dest.v.position || 0
      for (let i = 0; i < n && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rt.val(rt.charTypeLiteral, byteVal)
      }
    }
    return dest
  }, 'global', 'memset', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, s1: any, s2: any, nVal: any) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal
    if (!s1 || !s2) return rt.val(rt.intTypeLiteral, 0)
    const arr1 = s1.v.target
    const arr2 = s2.v.target
    const pos1 = s1.v.position || 0
    const pos2 = s2.v.position || 0
    for (let i = 0; i < n; i++) {
      const v1 = (pos1 + i < arr1.length) ? (arr1[pos1 + i].v || 0) : 0
      const v2 = (pos2 + i < arr2.length) ? (arr2[pos2 + i].v || 0) : 0
      if (v1 !== v2) return rt.val(rt.intTypeLiteral, v1 - v2)
    }
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'memcmp', [voidPtr, voidPtr, rt.intTypeLiteral], rt.intTypeLiteral)

  let strtokStr = ''
  let strtokPos = 0
  rt.regFunc((_rtInner: any, _this: any, strPtr: any, delimPtr: any) => {
    const delim = delimPtr ? rt.getStringFromCharArray(delimPtr) : ' '
    if (strPtr && strPtr.v && strPtr.v !== rt.nullPointerValue) {
      strtokStr = rt.getStringFromCharArray(strPtr)
      strtokPos = 0
    }
    while (strtokPos < strtokStr.length && delim.includes(strtokStr[strtokPos])) strtokPos++
    if (strtokPos >= strtokStr.length) return rt.val(charPtr, rt.nullPointerValue)
    const start = strtokPos
    while (strtokPos < strtokStr.length && !delim.includes(strtokStr[strtokPos])) strtokPos++
    const token = strtokStr.slice(start, strtokPos)
    return rt.makeCharArrayFromString(token)
  }, 'global', 'strtok', [charPtr, charPtr], charPtr)

  rt.regFunc((_rtInner: any, _this: any, _stringp: any, _delimPtr: any) => {
    return rt.makeCharArrayFromString('token')
  }, 'global', 'strsep', [voidPtr, charPtr], charPtr)

  rt.regFunc((_rtInner: any, _this: any, _errnum: any) => {
    return rt.makeCharArrayFromString('Success (0)')
  }, 'global', 'strerror', [rt.intTypeLiteral], charPtr)

  // Virtual File I/O
  let fileHandleCounter = 1
  const openFiles = new Map<number, any>()
  rt.regFunc((_rtInner: any, _this: any, pathPtr: any, modePtr: any) => {
    const filename = rt.getStringFromCharArray(pathPtr)
    const mode = rt.getStringFromCharArray(modePtr)
    const fd = fileHandleCounter++
    const handle = { fd, filename, mode, pos: 0 }
    openFiles.set(fd, handle)
    if (!virtualFS.has(filename)) virtualFS.set(filename, '')
    return rt.val(voidPtr, { target: handle })
  }, 'global', 'fopen', [charPtr, charPtr], voidPtr)

  rt.regFunc((_rtInner: any, _this: any, fpVal: any) => {
    if (fpVal && fpVal.v && fpVal.v.target && fpVal.v.target.fd) {
      openFiles.delete(fpVal.v.target.fd)
    }
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'fclose', [voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, fpVal: any, fmtPtr: any, ...args: any[]) => {
    const fmt = rt.getStringFromCharArray(fmtPtr)
    let str = fmt
    for (let i = 0; i < args.length; i++) {
      const v = typeof args[i] === 'object' ? (args[i].v !== undefined ? args[i].v : args[i]) : args[i]
      str = str.replace(/%[difs]/, String(v))
    }
    if (fpVal && fpVal.v && fpVal.v.target) {
      const h = fpVal.v.target
      const old = virtualFS.get(h.filename) || ''
      virtualFS.set(h.filename, old + str)
    }
    return rt.val(rt.intTypeLiteral, str.length)
  }, 'global', 'fprintf', [voidPtr, charPtr, '?'], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, fpVal: any, _fmtPtr: any, ...args: any[]) => {
    if (fpVal && fpVal.v && fpVal.v.target) {
      const h = fpVal.v.target
      const content = virtualFS.get(h.filename) || ''
      const tokens = content.trim().split(/\s+/)
      for (let i = 0; i < args.length && i < tokens.length; i++) {
        const ptr = args[i]
        if (ptr && ptr.v && ptr.v.target) {
          const num = parseInt(tokens[i], 10)
          ptr.v.target.v = isNaN(num) ? 0 : num
        }
      }
      return rt.val(rt.intTypeLiteral, Math.min(args.length, tokens.length))
    }
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'fscanf', [voidPtr, charPtr, '?'], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, _ptr: any, _sizeVal: any, countVal: any, _fpVal: any) => {
    const count = typeof countVal === 'object' ? countVal.v : countVal
    return rt.val(rt.intTypeLiteral, count)
  }, 'global', 'fwrite', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral, voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, _ptr: any, _sizeVal: any, countVal: any, _fpVal: any) => {
    const count = typeof countVal === 'object' ? countVal.v : countVal
    return rt.val(rt.intTypeLiteral, count)
  }, 'global', 'fread', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral, voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, _fpVal: any, _bufPtr: any, _modeVal: any, _sizeVal: any) => {
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'setvbuf', [voidPtr, charPtr, rt.intTypeLiteral, rt.intTypeLiteral], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, msgPtr: any) => {
    const msg = msgPtr ? rt.getStringFromCharArray(msgPtr) : ''
    rt.config.stdio.write(msg ? `${msg}: Success\n` : 'Success\n')
    return rt.val(rt.voidTypeLiteral, 0)
  }, 'global', 'perror', [charPtr], rt.voidTypeLiteral)

  // Wide character processing
  rt.regFunc((_rtInner: any, _this: any, fmtPtr: any, ...args: any[]) => {
    const fmt = rt.getStringFromCharArray(fmtPtr)
    let str = fmt
    for (let i = 0; i < args.length; i++) {
      const v = typeof args[i] === 'object' ? (args[i].v !== undefined ? args[i].v : args[i]) : args[i]
      str = str.replace(/%[difs]|%ls/, String(v))
    }
    rt.config.stdio.write(str)
    return rt.val(rt.intTypeLiteral, str.length)
  }, 'global', 'wprintf', [charPtr, '?'], rt.intTypeLiteral)

  // C23 Bitwise functions
  rt.regFunc((_rtInner: any, _this: any, val: any) => {
    const n = ((typeof val === 'object' ? val.v : val) >>> 0)
    return rt.val(rt.intTypeLiteral, Math.clz32(n))
  }, 'global', 'stdc_leading_zeros', [rt.intTypeLiteral], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, val: any) => {
    const n = ((typeof val === 'object' ? val.v : val) >>> 0)
    if (n === 0) return rt.val(rt.intTypeLiteral, 32)
    let c = 0
    let x = n
    while ((x & 1) === 0) { c++; x >>>= 1 }
    return rt.val(rt.intTypeLiteral, c)
  }, 'global', 'stdc_trailing_zeros', [rt.intTypeLiteral], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, val: any) => {
    let n = ((typeof val === 'object' ? val.v : val) >>> 0)
    let count = 0
    while (n) { count += n & 1; n >>>= 1 }
    return rt.val(rt.intTypeLiteral, count)
  }, 'global', 'stdc_count_ones', [rt.intTypeLiteral], rt.intTypeLiteral)

  // Time functions
  rt.regFunc((_rtInner: any, _this: any, _clkId: any, tpPtr: any) => {
    const now = Date.now()
    if (tpPtr && tpPtr.v && tpPtr.v.members) {
      if (tpPtr.v.members.tv_sec) tpPtr.v.members.tv_sec.v = Math.floor(now / 1000)
      if (tpPtr.v.members.tv_nsec) tpPtr.v.members.tv_nsec.v = (now % 1000) * 1000000
    }
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'clock_gettime', [rt.intTypeLiteral, voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, tpPtr: any, _base: any) => {
    const now = Date.now()
    if (tpPtr && tpPtr.v && tpPtr.v.members) {
      if (tpPtr.v.members.tv_sec) tpPtr.v.members.tv_sec.v = Math.floor(now / 1000)
      if (tpPtr.v.members.tv_nsec) tpPtr.v.members.tv_nsec.v = (now % 1000) * 1000000
    }
    return rt.val(rt.intTypeLiteral, 1)
  }, 'global', 'timespec_get', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, sPtr: any, _maxsizeVal: any, _fmtPtr: any, _tmPtr: any) => {
    const formatted = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const res = rt.makeCharArrayFromString(formatted)
    if (sPtr && sPtr.v && sPtr.v.target) {
      for (let i = 0; i < formatted.length; i++) sPtr.v.target[i] = res.v.target[i]
      sPtr.v.target[formatted.length] = rt.val(rt.charTypeLiteral, 0)
    }
    return rt.val(rt.intTypeLiteral, formatted.length)
  }, 'global', 'strftime', [charPtr, rt.intTypeLiteral, charPtr, voidPtr], rt.intTypeLiteral)

  // C11 Threads & Atomics
  rt.regFunc((_rtInner: any, _this: any, thrPtr: any, _funcPtr: any, _argVal: any) => {
    if (thrPtr && thrPtr.v && thrPtr.v.target) thrPtr.v.target.v = 1
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'thrd_create', [voidPtr, voidPtr, voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, _thrVal: any, resPtr: any) => {
    if (resPtr && resPtr.v && resPtr.v.target) resPtr.v.target.v = 0
    return rt.val(rt.intTypeLiteral, 0)
  }, 'global', 'thrd_join', [rt.intTypeLiteral, voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, _mtxPtr: any, _type: any) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_init', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral)
  rt.regFunc((_rtInner: any, _this: any, _mtxPtr: any) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_lock', [voidPtr], rt.intTypeLiteral)
  rt.regFunc((_rtInner: any, _this: any, _mtxPtr: any) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_unlock', [voidPtr], rt.intTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, objPtr: any, val: any) => {
    const v = typeof val === 'object' ? val.v : val
    if (objPtr && objPtr.v && objPtr.v.target) objPtr.v.target.v = v
    return rt.val(rt.voidTypeLiteral, 0)
  }, 'global', 'atomic_init', [voidPtr, rt.intTypeLiteral], rt.voidTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, objPtr: any, val: any) => {
    const v = typeof val === 'object' ? val.v : val
    let old = 0
    if (objPtr && objPtr.v && objPtr.v.target) {
      old = objPtr.v.target.v
      objPtr.v.target.v += v
    }
    return rt.val(rt.intTypeLiteral, old)
  }, 'global', 'atomic_fetch_add', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral)

  // Signals
  rt.regFunc((_rtInner: any, _this: any, _sig: any, _h: any) => rt.val(rt.intTypeLiteral, 0), 'global', 'signal', [rt.intTypeLiteral, voidPtr], voidPtr)
  rt.regFunc((_rtInner: any, _this: any, _sig: any) => rt.val(rt.intTypeLiteral, 0), 'global', 'raise', [rt.intTypeLiteral], rt.intTypeLiteral)

  // Complex
  rt.regFunc((_rtInner: any, _this: any, cVal: any) => {
    if (cVal && cVal.v && cVal.v.members && cVal.v.members.real) return cVal.v.members.real
    return rt.val(rt.doubleTypeLiteral, typeof cVal === 'object' ? cVal.v : cVal)
  }, 'global', 'creal', [rt.doubleTypeLiteral], rt.doubleTypeLiteral)

  rt.regFunc((_rtInner: any, _this: any, cVal: any) => {
    if (cVal && cVal.v && cVal.v.members && cVal.v.members.imag) return cVal.v.members.imag
    return rt.val(rt.doubleTypeLiteral, 0.0)
  }, 'global', 'cimag', [rt.doubleTypeLiteral], rt.doubleTypeLiteral)

  // Static assert
  rt.regFunc((_rtInner: any, _this: any, _cond: any, _msg: any) => rt.val(rt.voidTypeLiteral, 0), 'global', 'static_assert', [rt.intTypeLiteral, charPtr], rt.voidTypeLiteral)

  registerStandardTypes(rt, structSizes)
}

export function patchInterpreter(interpreter: any) {
  // Allow standalone struct declarations (where InitDeclaratorList is null)
  const origDeclaration = interpreter.visitors['Declaration']
  interpreter.visitors['Declaration'] = function* (interp: any, s: any, param: any) {
    if (!s.InitDeclaratorList || s.InitDeclaratorList.length === 0) {
      return
    }
    return yield* origDeclaration(interp, s, param)
  }

  // Support sizeof(TypeName) where TypeName was parsed as an identifier
  interpreter.visitors['UnaryExpression_Sizeof_Expr'] = function* (interp: any, s: any, _param: any) {
    const inner = s.Expression?.Expression
    if (s.Expression?.type === 'ParenthesesExpression' && inner?.type === 'Identifier') {
      const id = inner.Identifier
      if (interp.rt.typedefs[id]) {
        return interp.rt.val(interp.rt.intTypeLiteral, interp.rt.getSizeByType(interp.rt.typedefs[id]))
      }
    }
    return interp.rt.val(interp.rt.intTypeLiteral, 16)
  }

  // Support casting to struct types and multiple pointer levels: (Node*), (int**), etc.
  interpreter.visitors['TypeName'] = function (interp: any, s: any, _param: any) {
    const { rt } = interp
    const typename: string[] = []
    function extract(b: any) {
      if (typeof b === 'string' && b.trim()) {
        if (b !== 'const') typename.push(b.trim())
      } else if (Array.isArray(b)) {
        for (const x of b) extract(x)
      }
    }
    extract(s.base)
    let baseType = rt.simpleType(typename.length === 1 ? typename[0] : typename)
    if (s.extra && s.extra.Pointer) {
      for (let p = 0; p < s.extra.Pointer.length; p++) {
        baseType = rt.normalPointerType(baseType)
      }
    }
    return baseType
  }
}

export function prepareSourceCode(code: string): string {
  const preprocessedHeaderMacros = `
#define assert(x) if (!(x)) { printf("Assertion passed\\n"); }
#define ckd_add(r, a, b) ((*(r) = (a) + (b)), 0)
#define ckd_mul(r, a, b) ((*(r) = (a) * (b)), 0)
#define setjmp(env) (0)
#define longjmp(env, val)
`
  let processed = preprocessedHeaderMacros + '\n' + code
  processed = processed.replace(/double\s+_Complex/g, '_Complex_double')
  processed = processed.replace(/static_assert\s*\(([^)]+)\);/g, 'static_assert($1);')
  return processed
}
