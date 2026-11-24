export function isCanonicalNonNegativeIntId(id: string): boolean {
  if (!/^(?:0|[1-9]\d*)$/.test(id)) return false
  const parsed = Number(id)
  return Number.isSafeInteger(parsed)
}

function escapeSingleQuotedId(raw: string): string {
  const escaped = raw
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  return `'${escaped}'`
}

function unescapeSingleQuotedId(raw: string): string {
  return raw.replace(/\\([nrt'"\\])/g, (_match, ch: string) => {
    if (ch === 'n') return '\n'
    if (ch === 'r') return '\r'
    if (ch === 't') return '\t'
    return ch
  })
}

export function compressIdList(ids: readonly string[]): string {
  if (!Array.isArray(ids) || ids.length === 0) return ''

  const seen = new Set<string>()
  const numericIds: number[] = []
  const otherIds: string[] = []

  for (const rawId of ids) {
    if (typeof rawId !== 'string' || rawId.length === 0) continue
    if (seen.has(rawId)) continue
    seen.add(rawId)
    if (isCanonicalNonNegativeIntId(rawId)) {
      numericIds.push(Number(rawId))
    } else {
      otherIds.push(rawId)
    }
  }

  const tokens: string[] = []
  if (numericIds.length > 0) {
    numericIds.sort((a, b) => a - b)
    let rangeStart = numericIds[0]
    let rangeEnd = numericIds[0]
    for (let i = 1; i < numericIds.length; i++) {
      const value = numericIds[i]
      if (value === rangeEnd + 1) {
        rangeEnd = value
      } else {
        tokens.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}~${rangeEnd}`)
        rangeStart = value
        rangeEnd = value
      }
    }
    tokens.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}~${rangeEnd}`)
  }

  for (const other of otherIds) {
    tokens.push(escapeSingleQuotedId(other))
  }

  return tokens.join(',')
}

function splitIdSpecTokens(spec: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let escaping = false

  for (const char of spec) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }
    if (char === '\\' && inSingleQuote) {
      current += char
      escaping = true
      continue
    }
    if (char === "'") {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }
    if ((char === ',' || char === '，') && !inSingleQuote) {
      const trimmed = current.trim()
      if (!trimmed) {
        throw new Error('弹幕 ID 列表格式无效：存在空项')
      }
      tokens.push(trimmed)
      current = ''
      continue
    }
    current += char
  }

  if (escaping || inSingleQuote) {
    throw new Error('弹幕 ID 列表中存在未闭合的单引号')
  }

  const trimmed = current.trim()
  if (!trimmed) {
    throw new Error('弹幕 ID 列表格式无效：存在空项')
  }
  tokens.push(trimmed)
  return tokens
}

export function expandIdList(spec: string, maxCount = 10_000): string[] {
  if (typeof spec !== 'string') {
    throw new Error('弹幕 ID 列表必须是字符串')
  }
  const trimmedSpec = spec.trim()
  if (!trimmedSpec) {
    throw new Error('弹幕 ID 列表不能为空')
  }

  const tokens = splitIdSpecTokens(trimmedSpec)
  const result: string[] = []
  const seen = new Set<string>()

  const pushId = (id: string) => {
    if (seen.has(id)) return
    if (result.length >= maxCount) {
      throw new Error(`弹幕 ID 数量超过上限（${maxCount} 个）`)
    }
    seen.add(id)
    result.push(id)
  }

  for (const token of tokens) {
    if (token.startsWith("'") && token.endsWith("'")) {
      if (token.length < 2) {
        throw new Error('弹幕 ID 不能为空')
      }
      const unescaped = unescapeSingleQuotedId(token.slice(1, -1))
      if (!unescaped) {
        throw new Error('弹幕 ID 不能为空')
      }
      pushId(unescaped)
      continue
    }

    if (token.includes('~')) {
      const parts = token.split('~').map((part) => part.trim())
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`弹幕 ID 范围格式无效：${token}`)
      }
      if (!isCanonicalNonNegativeIntId(parts[0]) || !isCanonicalNonNegativeIntId(parts[1])) {
        throw new Error(`弹幕 ID 范围起止必须是非负整数：${token}`)
      }
      const start = Number(parts[0])
      const end = Number(parts[1])
      const lo = Math.min(start, end)
      const hi = Math.max(start, end)
      const span = hi - lo + 1
      if (span > maxCount || result.length + span > maxCount) {
        throw new Error(`弹幕 ID 范围展开后数量超过上限（${maxCount} 个）：${token}`)
      }
      for (let n = lo; n <= hi; n++) {
        pushId(String(n))
      }
      continue
    }

    if (token.includes("'") || token.includes('"')) {
      throw new Error(`弹幕 ID 格式无效：${token}`)
    }
    pushId(token)
  }

  if (result.length === 0 || result.length > maxCount) {
    throw new Error(`弹幕 ID 数量无效或超过上限（${maxCount} 个）`)
  }
  return result
}
