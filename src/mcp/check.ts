import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

type JsonRpcResponse = {
  id?: number
  result?: any
  error?: { code: number; message: string }
}

const child = spawn(process.execPath, [
  '--experimental-strip-types',
  fileURLToPath(new URL('./server.ts', import.meta.url))
], { stdio: ['pipe', 'pipe', 'inherit'] })

let output = ''
let nextId = 0
const pending = new Map<number, { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }>()

child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk: string) => {
  output += chunk
  let newline = output.indexOf('\n')
  while (newline !== -1) {
    const line = output.slice(0, newline)
    output = output.slice(newline + 1)
    newline = output.indexOf('\n')
    if (!line.trim()) continue
    let response: JsonRpcResponse
    try {
      response = JSON.parse(line) as JsonRpcResponse
    } catch {
      for (const request of pending.values()) request.reject(new Error('MCP 服务在 stdout 输出了非 JSON 内容'))
      pending.clear()
      continue
    }
    if (typeof response.id === 'number') {
      const request = pending.get(response.id)
      if (request) {
        pending.delete(response.id)
        request.resolve(response)
      }
    }
  }
})

child.on('error', (error) => {
  for (const request of pending.values()) request.reject(error)
  pending.clear()
})
child.on('exit', (code) => {
  for (const request of pending.values()) request.reject(new Error(`MCP 服务提前退出（${code ?? 'unknown'}）`))
  pending.clear()
})

function request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
  const id = ++nextId
  let timeout: ReturnType<typeof setTimeout> | undefined
  const response = new Promise<JsonRpcResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    timeout = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`等待 MCP ${method} 响应超时`))
    }, 5000)
  })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n')
  return response.finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

async function main() {
  try {
    const initialized = await request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'm7-editor-mcp-check', version: '1.0.0' }
    })
    if (initialized.error) throw new Error(initialized.error.message)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

    const listed = await request('tools/list')
    if (listed.error) throw new Error(listed.error.message)
    const tools = listed.result?.tools
    if (!Array.isArray(tools) || tools.length === 0) throw new Error('MCP 服务没有注册工具')
    const requiredTools = [
      'create_danmakus', 'delete_danmakus', 'update_current_time', 'update_editor_settings',
      'save_folder_project', 'backup_folder_project', 'get_editor_logs',
      'list_history_snapshots', 'get_history_snapshot', 'create_generated_danmakus', 'get_frame'
    ]
    const missingTools = requiredTools.filter((name) => !tools.some((tool: { name?: string }) => tool.name === name))
    if (missingTools.length) throw new Error(`MCP 服务缺少工具：${missingTools.join(', ')}`)
    console.log(`MCP 握手成功，已发现 ${tools.length} 个工具。`)

    const invalidInput = await request('tools/call', {
      name: 'mirror_danmakus',
      arguments: { axis: 'diagonal' }
    })
    if (!invalidInput.error && invalidInput.result?.isError !== true) {
      throw new Error('Zod 没有拒绝无效的工具参数')
    }
    console.log('Zod 参数校验正常，无效镜像方向已在调用编辑器前拒绝。')

    const invalidCreate = await request('tools/call', {
      name: 'create_danmakus',
      arguments: { relativeToCurrentTime: false }
    })
    const createErrorText = invalidCreate.result?.content?.find((item: { type?: string }) => item.type === 'text')?.text
    if (!invalidCreate.error && invalidCreate.result?.isError !== true) {
      throw new Error('创建工具没有拒绝缺失的弹幕输入')
    }
    if (!String(createErrorText || invalidCreate.error?.message || '').includes('danmaku')) {
      throw new Error('创建工具没有返回可理解的输入错误')
    }
    console.log('创建参数检查正常，缺少对象和 JSON 路径时已拒绝请求。')

    const invalidFrame = await request('tools/call', {
      name: 'get_frame',
      arguments: { timeMs: -1 }
    })
    if (!invalidFrame.error && invalidFrame.result?.isError !== true) {
      throw new Error('帧截图工具没有拒绝负时间')
    }
    console.log('帧截图参数检查正常，负时间已在调用编辑器前拒绝。')

    const invalidRules = await request('tools/call', {
      name: 'create_generated_danmakus',
      arguments: { quantity: 1, rules: { unsupportedField: { mode: 'range', start: 0, end: 1 } } }
    })
    if (!invalidRules.error && invalidRules.result?.isError !== true) {
      throw new Error('生成工具没有拒绝未知字段规则')
    }
    console.log('生成规则参数检查正常，未知字段已在调用编辑器前拒绝。')

    const state = await request('tools/call', { name: 'get_editor_state', arguments: {} })
    if (state.error) throw new Error(state.error.message)
    if (state.result?.isError) {
      const message = state.result.content?.find((item: { type?: string }) => item.type === 'text')?.text || '未知错误'
      if (String(message).includes('编辑器服务离线')) {
        console.log('MCP 工具调用成功；当前没有检测到运行中的 m7-editor 会话。启动 npm run tauri dev 后再运行本检查即可验证桥接。')
        return
      }
      throw new Error(String(message))
    }
    console.log('MCP 工具调用成功，当前编辑器状态：')
    console.log(state.result?.content?.find((item: { type?: string }) => item.type === 'text')?.text || '(无文本结果)')
  } finally {
    child.stdin.end()
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 1000))
      ])
      if (child.exitCode === null && child.signalCode === null) child.kill()
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
