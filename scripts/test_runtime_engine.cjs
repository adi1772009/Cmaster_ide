const JSCPP = require('JSCPP');
const rt_1 = require('JSCPP/lib/rt');
const interpreter_1 = require('JSCPP/lib/interpreter');
const ast = require('JSCPP/lib/ast');
const preprocessor = require('JSCPP/lib/preprocessor');
const PEGUtil = require('pegjs-util');

function overrideFunc(rt, lt, name, args, retType, impl) {
  const ltsig = rt.getTypeSignature(lt);
  if (ltsig in rt.types) {
    const t = rt.types[ltsig].handlers;
    if (t[name]) {
      const sig = rt.makeParametersSignature(args);
      if (t[name].functions) delete t[name].functions[sig];
      if (t[name].reg) delete t[name].reg[sig];
    }
  }
  rt.regFunc(impl, lt, name, args, retType);
}

function setupStandardHeaders(includes) {
  const headers = [
    'assert.h', 'complex.h', 'ctype.h', 'errno.h', 'fenv.h',
    'float.h', 'inttypes.h', 'iso646.h', 'limits.h', 'locale.h',
    'math.h', 'setjmp.h', 'signal.h', 'stdalign.h', 'stdarg.h',
    'stdatomic.h', 'stdbool.h', 'stddef.h', 'stdint.h', 'stdio.h',
    'stdlib.h', 'stdnoreturn.h', 'string.h', 'tgmath.h', 'threads.h',
    'time.h', 'uchar.h', 'wchar.h', 'wctype.h', 'stdbit.h', 'stdckdint.h'
  ];

  headers.forEach(h => {
    if (!includes[h]) {
      includes[h] = { load(rt) {} };
    }
    const noExt = h.replace('.h', '');
    if (!includes[noExt]) {
      includes[noExt] = includes[h];
    }
  });

  const baseCstdio = includes['cstdio'] || includes['stdio.h'];
  const customCstdio = {
    load(rt) {
      if (baseCstdio) baseCstdio.load(rt);
      const charPtr = rt.normalPointerType(rt.charTypeLiteral);

      function safeFormat(fmt, args) {
        let argIdx = 0;
        return fmt.replace(/%(-?\d+)?(?:\.(\d+))?(?:l|ll|h|hh|z)?([a-zA-Z%])/g, (match, width, prec, spec) => {
          if (spec === '%') return '%';
          if (argIdx >= args.length) return match;
          const raw = args[argIdx++];
          const val = (raw && typeof raw === 'object' && raw.v !== undefined) ? raw.v : raw;
          let str = '';
          switch (spec) {
            case 'd':
            case 'i':
            case 'ld':
            case 'lld':
              str = String(parseInt(val, 10) || 0);
              break;
            case 'u':
            case 'lu':
            case 'llu':
              str = String(Math.max(0, parseInt(val, 10) || 0));
              break;
            case 'x':
              str = (parseInt(val, 10) || 0).toString(16);
              break;
            case 'X':
              str = (parseInt(val, 10) || 0).toString(16).toUpperCase();
              break;
            case 'o':
              str = (parseInt(val, 10) || 0).toString(8);
              break;
            case 'f':
            case 'F':
            case 'lf': {
              const p = prec !== undefined ? parseInt(prec, 10) : 6;
              str = (parseFloat(val) || 0).toFixed(p);
              break;
            }
            case 'c':
              str = typeof val === 'number' ? String.fromCharCode(val) : String(val);
              break;
            case 's':
              str = String(val !== undefined && val !== null ? val : '');
              break;
            case 'p':
              str = '0x' + (parseInt(val, 10) || 0).toString(16);
              break;
            default:
              str = String(val);
          }
          return str;
        });
      }

      overrideFunc(rt, 'global', 'printf', [charPtr, '?'], rt.intTypeLiteral, (rt, _this, formatPtr, ...params) => {
        const fmt = rt.isStringType(formatPtr.t) ? rt.getStringFromCharArray(formatPtr) : String(formatPtr.v);
        const result = safeFormat(fmt, params);
        rt.config.stdio.write(result);
        return rt.val(rt.intTypeLiteral, result.length);
      });
    }
  };
  includes['cstdio'] = customCstdio;
  includes['stdio.h'] = customCstdio;
}

const virtualFS = new Map();

function extractAndRegisterStructs(rt, source, structSizes) {
  const cleanSource = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const re = /(?:typedef\s+)?struct\s*([a-zA-Z_0-9]*)\s*\{([^}]+)\}\s*([a-zA-Z_0-9]*)\s*;/g;
  let match;

  while ((match = re.exec(cleanSource)) !== null) {
    const isTypedef = match[0].trim().startsWith('typedef');
    const tag = match[1] ? match[1].trim() : null;
    const body = match[2];
    const alias = match[3] ? match[3].trim() : null;

    const structName = tag ? `struct ${tag}` : (alias ? `struct ${alias}` : `struct _anon_${Math.random().toString(36).substr(2, 6)}`);
    const members = [];
    const stmts = body.split(';').map(s => s.trim()).filter(Boolean);

    for (const stmt of stmts) {
      const parts = stmt.split(/\s+/);
      let typePart = '';
      let declPart = '';

      if (parts[0] === 'struct') {
        typePart = parts[0] + ' ' + parts[1];
        declPart = parts.slice(2).join(' ');
      } else if (['unsigned', 'signed', 'long', 'short'].includes(parts[0])) {
        if (parts[1] && !parts[1].includes('*') && !parts[1].includes('[') && !parts[1].includes(',')) {
          typePart = parts[0] + ' ' + parts[1];
          declPart = parts.slice(2).join(' ');
        } else {
          typePart = parts[0];
          declPart = parts.slice(1).join(' ');
        }
      } else {
        typePart = parts[0];
        declPart = parts.slice(1).join(' ');
      }

      if (typePart.includes('*')) {
        const tSplit = typePart.split('*');
        typePart = tSplit[0];
        declPart = '*' + tSplit.slice(1).join('*') + (declPart ? ' ' + declPart : '');
      }

      const decls = declPart.split(',').map(d => d.trim()).filter(Boolean);
      for (const d of decls) {
        const isPtr = d.includes('*') || typePart.includes('*');
        const arrMatch = d.match(/([a-zA-Z_0-9]+)\s*\[(\d+)\]/);
        let mName = d.replace(/[\*\[\]\d\s]/g, '');
        let mType = rt.intTypeLiteral;

        if (isPtr) {
          mType = rt.normalPointerType(rt.voidTypeLiteral);
        } else if (arrMatch) {
          mName = arrMatch[1];
          const arrLen = parseInt(arrMatch[2], 10);
          let elemType = rt.intTypeLiteral;
          if (typePart.includes('char')) elemType = rt.charTypeLiteral;
          else if (typePart.includes('float')) elemType = rt.floatTypeLiteral;
          else if (typePart.includes('double')) elemType = rt.doubleTypeLiteral;
          mType = rt.arrayType(elemType, arrLen);
        } else {
          if (typePart.includes('char')) mType = rt.charTypeLiteral;
          else if (typePart.includes('float')) mType = rt.floatTypeLiteral;
          else if (typePart.includes('double')) mType = rt.doubleTypeLiteral;
          else if (typePart.includes('short')) mType = rt.shortTypeLiteral;
          else if (typePart.includes('long')) mType = rt.longTypeLiteral;
          else mType = rt.intTypeLiteral;
        }

        members.push({
          name: mName,
          type: mType,
          initialize: () => {
            const v = rt.defaultValue(mType, true);
            v.left = true;
            return v;
          }
        });
      }
    }

    const cls = rt.newClass(structName, members);
    const sig = rt.getTypeSignature(cls);
    const ptrType = rt.normalPointerType(cls);
    structSizes[sig] = Math.max(16, members.length * 8);

    rt.types[sig].handlers['o(&)'] = {
      *default(rt, l) {
        return rt.val(ptrType, rt.makeNormalPointerValue(l));
      }
    };

    rt.types[sig].handlers['='] = {
      default(rt, l, r) {
        if (!l.left) rt.raiseException('Struct is not a left value');
        if (r && r.v && r.v.members) {
          for (const k of Object.keys(r.v.members)) {
            if (l.v.members[k]) {
              l.v.members[k].v = r.v.members[k].v;
            }
          }
        }
        return l;
      }
    };

    if (alias) {
      rt.registerTypedef(cls, alias);
      structSizes[alias] = structSizes[sig];
    }
    if (tag) {
      structSizes[`struct ${tag}`] = structSizes[sig];
    }
  }
}

function registerStandardTypes(rt, structSizes) {
  const voidPtr = rt.normalPointerType(rt.voidTypeLiteral);
  
  // Typedefs for all C standard headers
  rt.registerTypedef(voidPtr, 'FILE');
  rt.registerTypedef(rt.intTypeLiteral, 'uint8_t');
  rt.registerTypedef(rt.intTypeLiteral, 'int8_t');
  rt.registerTypedef(rt.intTypeLiteral, 'uint16_t');
  rt.registerTypedef(rt.intTypeLiteral, 'int16_t');
  rt.registerTypedef(rt.intTypeLiteral, 'uint32_t');
  rt.registerTypedef(rt.intTypeLiteral, 'int32_t');
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'uint64_t');
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'int64_t');
  rt.registerTypedef(rt.intTypeLiteral, 'size_t');
  rt.registerTypedef(rt.intTypeLiteral, 'thrd_t');
  rt.registerTypedef(rt.intTypeLiteral, 'mtx_t');
  rt.registerTypedef(rt.intTypeLiteral, 'cnd_t');
  rt.registerTypedef(rt.longTypeLiteral || rt.intTypeLiteral, 'time_t');
  rt.registerTypedef(rt.intTypeLiteral, 'wchar_t');
  rt.registerTypedef(rt.intTypeLiteral, 'atomic_int');
  rt.registerTypedef(rt.intTypeLiteral, 'atomic_bool');
  rt.registerTypedef(rt.intTypeLiteral, 'jmp_buf');

  // Register struct timespec & struct tm
  const tsMembers = [
    { name: 'tv_sec', type: rt.longTypeLiteral || rt.intTypeLiteral, initialize: () => ({ t: rt.longTypeLiteral || rt.intTypeLiteral, v: 0, left: true }) },
    { name: 'tv_nsec', type: rt.longTypeLiteral || rt.intTypeLiteral, initialize: () => ({ t: rt.longTypeLiteral || rt.intTypeLiteral, v: 0, left: true }) }
  ];
  const tsCls = rt.newClass('struct timespec', tsMembers);
  const tsSig = rt.getTypeSignature(tsCls);
  structSizes[tsSig] = 16;
  structSizes['struct timespec'] = 16;
  rt.types[tsSig].handlers['o(&)'] = {
    *default(rt, l) {
      return rt.val(rt.normalPointerType(tsCls), rt.makeNormalPointerValue(l));
    }
  };

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
  ];
  const tmCls = rt.newClass('struct tm', tmMembers);
  const tmSig = rt.getTypeSignature(tmCls);
  structSizes[tmSig] = 36;
  structSizes['struct tm'] = 36;
  rt.types[tmSig].handlers['o(&)'] = {
    *default(rt, l) {
      return rt.val(rt.normalPointerType(tmCls), rt.makeNormalPointerValue(l));
    }
  };

  // Define NULL in global variables
  rt.scope[0].variables['NULL'] = rt.val(voidPtr, rt.nullPointerValue);
}

function patchRuntime(rt, structSizes) {
  const origPointerArrow = rt.types['pointer_normal'].handlers['o(->)'].default;
  rt.types['pointer_normal'].handlers['o(->)'].default = function*(rt, l) {
    return origPointerArrow(rt, l);
  };
  rt.types['pointer_normal'].handlers['o(*)'] = {
    *default(rt, l) {
      if (!l || !l.v || !l.v.target) rt.raiseException('Null pointer dereference (*)');
      return l.v.target;
    }
  };
  rt.types['pointer_normal'].handlers['o(&)'] = {
    default(rt, l, r) {
      if (r === undefined) {
        const t = rt.normalPointerType(l.t);
        return rt.val(t, rt.makeNormalPointerValue(l));
      }
      rt.raiseException('you cannot cast bitwise and on pointer');
    }
  };
  rt.types['pointer_normal'].handlers['o(==)'] = {
    default(rt, l, r) {
      const lt = l?.v ? (l.v.target !== undefined ? l.v.target : l.v) : null;
      const rtVal = r?.v ? (r.v.target !== undefined ? r.v.target : r.v) : null;
      return rt.val(rt.boolTypeLiteral, lt === rtVal);
    }
  };
  rt.types['pointer_normal'].handlers['o(!=)'] = {
    default(rt, l, r) {
      const lt = l?.v ? (l.v.target !== undefined ? l.v.target : l.v) : null;
      const rtVal = r?.v ? (r.v.target !== undefined ? r.v.target : r.v) : null;
      return rt.val(rt.boolTypeLiteral, lt !== rtVal);
    }
  };
  rt.types['pointer_normal'].handlers['o(!)'] = {
    default(rt, l) {
      const isNull = !l || !l.v || l.v === rt.nullPointerValue || l.v.target === null;
      return rt.val(rt.boolTypeLiteral, isNull);
    }
  };
  rt.types['pointer_normal'].handlers['='] = {
    default(rt, l, r) {
      if (!l.left) rt.raiseException('Pointer is not a left value');
      l.v = r.v;
      return l;
    }
  };
  const origSimpleType = rt.simpleType.bind(rt);
  rt.simpleType = function(type) {
    if (typeof type === 'string') {
      type = type.trim();
      if (this.typedefs[type]) return this.typedefs[type];
    }
    return origSimpleType(type);
  };
  const origGetSizeByType = rt.getSizeByType.bind(rt);
  rt.getSizeByType = function(t) {
    if (this.isClassType(t)) {
      const sig = this.getTypeSignature(t);
      if (structSizes[sig]) return structSizes[sig];
      return 32;
    }
    return origGetSizeByType(t);
  };
  const origCast = rt.cast.bind(rt);
  rt.cast = function(type, value) {
    if (!value) return origCast(type, value);
    if (value.v && value.v.isMallocBlock) {
      const size = value.v.size;
      if (this.isNormalPointerType(type)) {
        if (this.isClassType(type.targetType)) {
          const instance = this.defaultValue(type.targetType, true);
          return this.val(type, this.makeNormalPointerValue(instance));
        } else {
          const elemSize = this.getSizeByType(type.targetType) || 4;
          const count = Math.max(1, Math.floor(size / elemSize));
          const arr = Array.from({ length: count }, () => {
            const v = this.defaultValue(type.targetType, true);
            v.left = true;
            return v;
          });
          return this.val(this.arrayPointerType(type.targetType, count), this.makeArrayPointerValue(arr, 0));
        }
      }
    }
    if (this.isNormalPointerType(type)) {
      if (this.isNumericType(value.t) && value.v === 0) return this.val(type, this.nullPointerValue);
      if (this.isNormalPointerType(value) && (value.v === this.nullPointerValue || value.v.target === null)) return this.val(type, this.nullPointerValue);
      if (this.isNormalPointerType(value)) return this.val(type, value.v);
      if (this.isArrayType(value)) return value;
    }
    return origCast(type, value);
  };

  const voidPtr = rt.normalPointerType(rt.voidTypeLiteral);
  const charPtr = rt.normalPointerType(rt.charTypeLiteral);

  rt.regFunc((rt, _this, sizeVal) => {
    const size = typeof sizeVal === 'object' ? sizeVal.v : sizeVal;
    return rt.val(voidPtr, { isMallocBlock: true, size: size || 32, target: null });
  }, 'global', 'malloc', [rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, ptr) => rt.val(rt.voidTypeLiteral, 0), 'global', 'free', [voidPtr], rt.voidTypeLiteral);

  rt.regFunc((rt, _this, numVal, sizeVal) => {
    const num = typeof numVal === 'object' ? numVal.v : numVal;
    const size = typeof sizeVal === 'object' ? sizeVal.v : sizeVal;
    return rt.val(voidPtr, { isMallocBlock: true, size: (num || 1) * (size || 1), target: null });
  }, 'global', 'calloc', [rt.intTypeLiteral, rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, ptr, sizeVal) => ptr, 'global', 'realloc', [voidPtr, rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, codeVal) => {
    const c = typeof codeVal === 'object' ? codeVal.v : codeVal;
    return rt.val(rt.voidTypeLiteral, c);
  }, 'global', 'exit', [rt.intTypeLiteral], rt.voidTypeLiteral);

  // String & Memory
  rt.regFunc((rt, _this, dest, src, nVal) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal;
    if (dest && dest.v && src && src.v) {
      const dArr = dest.v.target;
      const sArr = src.v.target;
      const dPos = dest.v.position || 0;
      const sPos = src.v.position || 0;
      for (let i = 0; i < n && (sPos + i) < sArr.length && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rt.clone(sArr[sPos + i]);
      }
    }
    return dest;
  }, 'global', 'memcpy', [voidPtr, voidPtr, rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, dest, src, nVal) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal;
    if (dest && dest.v && src && src.v) {
      const dArr = dest.v.target;
      const sArr = src.v.target;
      const dPos = dest.v.position || 0;
      const sPos = src.v.position || 0;
      for (let i = 0; i < n && (sPos + i) < sArr.length && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rt.clone(sArr[sPos + i]);
      }
    }
    return dest;
  }, 'global', 'memmove', [voidPtr, voidPtr, rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, dest, valParam, nVal) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal;
    const byteVal = typeof valParam === 'object' ? valParam.v : valParam;
    if (dest && dest.v) {
      const dArr = dest.v.target;
      const dPos = dest.v.position || 0;
      for (let i = 0; i < n && (dPos + i) < dArr.length; i++) {
        dArr[dPos + i] = rt.val(rt.charTypeLiteral, byteVal);
      }
    }
    return dest;
  }, 'global', 'memset', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral], voidPtr);

  rt.regFunc((rt, _this, s1, s2, nVal) => {
    const n = typeof nVal === 'object' ? nVal.v : nVal;
    if (!s1 || !s2) return rt.val(rt.intTypeLiteral, 0);
    const arr1 = s1.v.target;
    const arr2 = s2.v.target;
    const pos1 = s1.v.position || 0;
    const pos2 = s2.v.position || 0;
    for (let i = 0; i < n; i++) {
      const v1 = (pos1 + i < arr1.length) ? (arr1[pos1 + i].v || 0) : 0;
      const v2 = (pos2 + i < arr2.length) ? (arr2[pos2 + i].v || 0) : 0;
      if (v1 !== v2) return rt.val(rt.intTypeLiteral, v1 - v2);
    }
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'memcmp', [voidPtr, voidPtr, rt.intTypeLiteral], rt.intTypeLiteral);

  let strtokStr = '';
  let strtokPos = 0;
  rt.regFunc((rt, _this, strPtr, delimPtr) => {
    const delim = delimPtr ? rt.getStringFromCharArray(delimPtr) : ' ';
    if (strPtr && strPtr.v && strPtr.v !== rt.nullPointerValue) {
      strtokStr = rt.getStringFromCharArray(strPtr);
      strtokPos = 0;
    }
    while (strtokPos < strtokStr.length && delim.includes(strtokStr[strtokPos])) strtokPos++;
    if (strtokPos >= strtokStr.length) return rt.val(charPtr, rt.nullPointerValue);
    const start = strtokPos;
    while (strtokPos < strtokStr.length && !delim.includes(strtokStr[strtokPos])) strtokPos++;
    const token = strtokStr.slice(start, strtokPos);
    return rt.makeCharArrayFromString(token);
  }, 'global', 'strtok', [charPtr, charPtr], charPtr);

  rt.regFunc((rt, _this, stringp, delimPtr) => {
    return rt.makeCharArrayFromString('token');
  }, 'global', 'strsep', [voidPtr, charPtr], charPtr);

  rt.regFunc((rt, _this, errnum) => {
    return rt.makeCharArrayFromString('Success (0)');
  }, 'global', 'strerror', [rt.intTypeLiteral], charPtr);

  // File I/O
  let fileHandleCounter = 1;
  const openFiles = new Map();
  rt.regFunc((rt, _this, pathPtr, modePtr) => {
    const filename = rt.getStringFromCharArray(pathPtr);
    const mode = rt.getStringFromCharArray(modePtr);
    const fd = fileHandleCounter++;
    const handle = { fd, filename, mode, pos: 0 };
    openFiles.set(fd, handle);
    if (!virtualFS.has(filename)) virtualFS.set(filename, '');
    return rt.val(voidPtr, { target: handle });
  }, 'global', 'fopen', [charPtr, charPtr], voidPtr);

  rt.regFunc((rt, _this, fpVal) => {
    if (fpVal && fpVal.v && fpVal.v.target && fpVal.v.target.fd) {
      openFiles.delete(fpVal.v.target.fd);
    }
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'fclose', [voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, fpVal, fmtPtr, ...args) => {
    const fmt = rt.getStringFromCharArray(fmtPtr);
    let str = fmt;
    for (let i = 0; i < args.length; i++) {
      const v = typeof args[i] === 'object' ? (args[i].v !== undefined ? args[i].v : args[i]) : args[i];
      str = str.replace(/%[difs]/, String(v));
    }
    if (fpVal && fpVal.v && fpVal.v.target) {
      const h = fpVal.v.target;
      const old = virtualFS.get(h.filename) || '';
      virtualFS.set(h.filename, old + str);
    }
    return rt.val(rt.intTypeLiteral, str.length);
  }, 'global', 'fprintf', [voidPtr, charPtr, '?'], rt.intTypeLiteral);

  rt.regFunc((rt, _this, fpVal, fmtPtr, ...args) => {
    if (fpVal && fpVal.v && fpVal.v.target) {
      const h = fpVal.v.target;
      const content = virtualFS.get(h.filename) || '';
      const tokens = content.trim().split(/\s+/);
      for (let i = 0; i < args.length && i < tokens.length; i++) {
        const ptr = args[i];
        if (ptr && ptr.v && ptr.v.target) {
          const num = parseInt(tokens[i], 10);
          ptr.v.target.v = isNaN(num) ? 0 : num;
        }
      }
      return rt.val(rt.intTypeLiteral, Math.min(args.length, tokens.length));
    }
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'fscanf', [voidPtr, charPtr, '?'], rt.intTypeLiteral);

  rt.regFunc((rt, _this, ptr, sizeVal, countVal, fpVal) => {
    const count = typeof countVal === 'object' ? countVal.v : countVal;
    return rt.val(rt.intTypeLiteral, count);
  }, 'global', 'fwrite', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral, voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, ptr, sizeVal, countVal, fpVal) => {
    const count = typeof countVal === 'object' ? countVal.v : countVal;
    return rt.val(rt.intTypeLiteral, count);
  }, 'global', 'fread', [voidPtr, rt.intTypeLiteral, rt.intTypeLiteral, voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, fpVal, bufPtr, modeVal, sizeVal) => rt.val(rt.intTypeLiteral, 0), 'global', 'setvbuf', [voidPtr, charPtr, rt.intTypeLiteral, rt.intTypeLiteral], rt.intTypeLiteral);
  rt.regFunc((rt, _this, msgPtr) => {
    const msg = msgPtr ? rt.getStringFromCharArray(msgPtr) : '';
    rt.config.stdio.write(msg ? `${msg}: Success\n` : 'Success\n');
    return rt.val(rt.voidTypeLiteral, 0);
  }, 'global', 'perror', [charPtr], rt.voidTypeLiteral);

  // Wide character
  rt.regFunc((rt, _this, fmtPtr, ...args) => {
    const fmt = rt.getStringFromCharArray(fmtPtr);
    let str = fmt;
    for (let i = 0; i < args.length; i++) {
      const v = typeof args[i] === 'object' ? (args[i].v !== undefined ? args[i].v : args[i]) : args[i];
      str = str.replace(/%[difs]|%ls/, String(v));
    }
    rt.config.stdio.write(str);
    return rt.val(rt.intTypeLiteral, str.length);
  }, 'global', 'wprintf', [charPtr, '?'], rt.intTypeLiteral);

  // Bitwise C23
  rt.regFunc((rt, _this, val) => {
    const n = (typeof val === 'object' ? val.v : val) >>> 0;
    return rt.val(rt.intTypeLiteral, Math.clz32(n));
  }, 'global', 'stdc_leading_zeros', [rt.intTypeLiteral], rt.intTypeLiteral);

  rt.regFunc((rt, _this, val) => {
    const n = (typeof val === 'object' ? val.v : val) >>> 0;
    if (n === 0) return rt.val(rt.intTypeLiteral, 32);
    let c = 0, x = n;
    while ((x & 1) === 0) { c++; x >>>= 1; }
    return rt.val(rt.intTypeLiteral, c);
  }, 'global', 'stdc_trailing_zeros', [rt.intTypeLiteral], rt.intTypeLiteral);

  rt.regFunc((rt, _this, val) => {
    let n = (typeof val === 'object' ? val.v : val) >>> 0;
    let count = 0;
    while (n) { count += n & 1; n >>>= 1; }
    return rt.val(rt.intTypeLiteral, count);
  }, 'global', 'stdc_count_ones', [rt.intTypeLiteral], rt.intTypeLiteral);

  // Time
  rt.regFunc((rt, _this, clkId, tpPtr) => {
    const now = Date.now();
    if (tpPtr && tpPtr.v && tpPtr.v.members) {
      if (tpPtr.v.members.tv_sec) tpPtr.v.members.tv_sec.v = Math.floor(now / 1000);
      if (tpPtr.v.members.tv_nsec) tpPtr.v.members.tv_nsec.v = (now % 1000) * 1000000;
    }
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'clock_gettime', [rt.intTypeLiteral, voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, tpPtr, base) => {
    const now = Date.now();
    if (tpPtr && tpPtr.v && tpPtr.v.members) {
      if (tpPtr.v.members.tv_sec) tpPtr.v.members.tv_sec.v = Math.floor(now / 1000);
      if (tpPtr.v.members.tv_nsec) tpPtr.v.members.tv_nsec.v = (now % 1000) * 1000000;
    }
    return rt.val(rt.intTypeLiteral, 1);
  }, 'global', 'timespec_get', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral);

  rt.regFunc((rt, _this, sPtr, maxsizeVal, fmtPtr, tmPtr) => {
    const formatted = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const res = rt.makeCharArrayFromString(formatted);
    if (sPtr && sPtr.v && sPtr.v.target) {
      for (let i = 0; i < formatted.length; i++) sPtr.v.target[i] = res.v.target[i];
      sPtr.v.target[formatted.length] = rt.val(rt.charTypeLiteral, 0);
    }
    return rt.val(rt.intTypeLiteral, formatted.length);
  }, 'global', 'strftime', [charPtr, rt.intTypeLiteral, charPtr, voidPtr], rt.intTypeLiteral);

  // Threads & Atomics
  rt.regFunc((rt, _this, thrPtr, funcPtr, argVal) => {
    if (thrPtr && thrPtr.v && thrPtr.v.target) thrPtr.v.target.v = 1;
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'thrd_create', [voidPtr, voidPtr, voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, thrVal, resPtr) => {
    if (resPtr && resPtr.v && resPtr.v.target) resPtr.v.target.v = 0;
    return rt.val(rt.intTypeLiteral, 0);
  }, 'global', 'thrd_join', [rt.intTypeLiteral, voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, mtxPtr, type) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_init', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral);
  rt.regFunc((rt, _this, mtxPtr) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_lock', [voidPtr], rt.intTypeLiteral);
  rt.regFunc((rt, _this, mtxPtr) => rt.val(rt.intTypeLiteral, 0), 'global', 'mtx_unlock', [voidPtr], rt.intTypeLiteral);

  rt.regFunc((rt, _this, objPtr, val) => {
    const v = typeof val === 'object' ? val.v : val;
    if (objPtr && objPtr.v && objPtr.v.target) objPtr.v.target.v = v;
    return rt.val(rt.voidTypeLiteral, 0);
  }, 'global', 'atomic_init', [voidPtr, rt.intTypeLiteral], rt.voidTypeLiteral);

  rt.regFunc((rt, _this, objPtr, val) => {
    const v = typeof val === 'object' ? val.v : val;
    let old = 0;
    if (objPtr && objPtr.v && objPtr.v.target) {
      old = objPtr.v.target.v;
      objPtr.v.target.v += v;
    }
    return rt.val(rt.intTypeLiteral, old);
  }, 'global', 'atomic_fetch_add', [voidPtr, rt.intTypeLiteral], rt.intTypeLiteral);

  // Signals
  rt.regFunc((rt, _this, sig, h) => rt.val(rt.intTypeLiteral, 0), 'global', 'signal', [rt.intTypeLiteral, voidPtr], voidPtr);
  rt.regFunc((rt, _this, sig) => rt.val(rt.intTypeLiteral, 0), 'global', 'raise', [rt.intTypeLiteral], rt.intTypeLiteral);

  // Complex
  rt.regFunc((rt, _this, cVal) => {
    if (cVal && cVal.v && cVal.v.members && cVal.v.members.real) return cVal.v.members.real;
    return rt.val(rt.doubleTypeLiteral, typeof cVal === 'object' ? cVal.v : cVal);
  }, 'global', 'creal', [rt.doubleTypeLiteral], rt.doubleTypeLiteral);

  rt.regFunc((rt, _this, cVal) => {
    if (cVal && cVal.v && cVal.v.members && cVal.v.members.imag) return cVal.v.members.imag;
    return rt.val(rt.doubleTypeLiteral, 0.0);
  }, 'global', 'cimag', [rt.doubleTypeLiteral], rt.doubleTypeLiteral);

  // Static assert built-in function
  rt.regFunc((rt, _this, cond, msg) => rt.val(rt.voidTypeLiteral, 0), 'global', 'static_assert', [rt.intTypeLiteral, charPtr], rt.voidTypeLiteral);

  registerStandardTypes(rt, structSizes);
}

function patchInterpreter(interpreter) {
  // Fix Declaration visitor to gracefully ignore empty InitDeclaratorList (e.g. struct definitions)
  const origDeclaration = interpreter.visitors['Declaration'];
  interpreter.visitors['Declaration'] = function*(interp, s, param) {
    if (!s.InitDeclaratorList || s.InitDeclaratorList.length === 0) {
      return;
    }
    return yield* origDeclaration(interp, s, param);
  };

  interpreter.visitors['UnaryExpression_Sizeof_Expr'] = function*(interp, s, param) {
    const inner = s.Expression?.Expression;
    if (s.Expression?.type === 'ParenthesesExpression' && inner?.type === 'Identifier') {
      const id = inner.Identifier;
      if (interp.rt.typedefs[id]) {
        return interp.rt.val(interp.rt.intTypeLiteral, interp.rt.getSizeByType(interp.rt.typedefs[id]));
      }
    }
    return interp.rt.val(interp.rt.intTypeLiteral, 16);
  };

  interpreter.visitors['TypeName'] = function(interp, s, param) {
    const { rt } = interp;
    const typename = [];
    function extract(b) {
      if (typeof b === 'string' && b.trim()) {
        if (b !== 'const') typename.push(b.trim());
      } else if (Array.isArray(b)) {
        for (const x of b) extract(x);
      }
    }
    extract(s.base);
    let baseType = rt.simpleType(typename.length === 1 ? typename[0] : typename);
    if (s.extra && s.extra.Pointer) {
      for (let p = 0; p < s.extra.Pointer.length; p++) {
        baseType = rt.normalPointerType(baseType);
      }
    }
    return baseType;
  };
}

function runCProgram(code, stdin = '') {
  let output = '';
  setupStandardHeaders(JSCPP.includes);

  const _config = {
    stdio: {
      write(s) { output += s; },
      drain() { return stdin; }
    },
    includes: JSCPP.includes
  };

  const rt = new rt_1.CRuntime(_config);
  const structSizes = {};
  patchRuntime(rt, structSizes);
  extractAndRegisterStructs(rt, code, structSizes);

  // Preprocessor macros
  const preprocessedHeaderMacros = `
#define assert(x) if (!(x)) { printf("Assertion failed\\n"); }
#define ckd_add(r, a, b) ((*(r) = (a) + (b)), 0)
#define ckd_mul(r, a, b) ((*(r) = (a) * (b)), 0)
#define setjmp(env) (0)
#define longjmp(env, val)
`;
  let processedCode = preprocessedHeaderMacros + '\n' + code;
  // Replace static_assert(...) with static_assert(...) function call
  processedCode = processedCode.replace(/static_assert\s*\(([^)]+)\);/g, 'static_assert($1);');

  const parsed = preprocessor.parse(rt, processedCode);
  const res = PEGUtil.parse(ast, parsed);
  if (res.error) {
    throw new Error('Parse error: ' + PEGUtil.errorMessage(res.error, true));
  }

  const interpreter = new interpreter_1.Interpreter(rt);
  patchInterpreter(interpreter);

  const defGen = interpreter.run(res.ast, parsed);
  while (!defGen.next().done) {}

  const mainGen = rt.getFunc('global', 'main', [])(rt, null);
  while (!mainGen.next().done) {}

  return output;
}

module.exports = { runCProgram, setupStandardHeaders, extractAndRegisterStructs, patchRuntime, patchInterpreter };
