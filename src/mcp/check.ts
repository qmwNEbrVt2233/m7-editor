import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { compressIdList, expandIdList } from '../utils/idRange.ts'

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
  assert.equal(compressIdList([]), '')
  assert.equal(compressIdList(['3', '1', '2', '7', '19']), '1~3,7,19')
  assert.equal(compressIdList(['1', '2']), '1~2')
  assert.equal(compressIdList(['007', '1', '2', "a'b", 'foo']), "1~2,'007','a\\'b','foo'")
  assert.deepEqual(expandIdList('1~3,7,19'), ['1', '2', '3', '7', '19'])
  assert.deepEqual(expandIdList("1~2,'007','a\\'b','foo'"), ['1', '2', '007', "a'b", 'foo'])
  assert.throws(() => expandIdList(''))
  assert.throws(() => expandIdList('1~20000', 10_000))
  console.log('ID 范围压缩与展开单元测试通过。')

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
      'get_editor_state', 'measure_text', 'get_frame', 'list_danmakus',
      'apply_field_update', 'apply_field_updates', 'create_generated_danmakus',
      'create_danmakus', 'delete_danmakus', 'select_by_command',
      'update_current_time', 'update_editor_settings',
      'save_folder_project', 'backup_folder_project', 'get_file_system_state',
      'check_folder_project_path', 'create_folder_project', 'load_folder_project',
      'import_folder_project', 'edit_folder_project', 'delete_folder_project',
      'import_single_project', 'import_xml_danmakus', 'skip_folder_project',
      'reload_app', 'get_editor_logs', 'list_history_snapshots', 'get_history_snapshot',
      'apply_stroke', 'center_danmakus', 'copy_coordinates', 'swap_coordinates',
      'mirror_danmakus', 'calculate_rotation', 'set_movement_length',
      'lock_movement_angle', 'split_danmakus', 'undo_edit', 'redo_edit',
      'export_video', 'get_video_export_status', 'cancel_video_export'
    ]
    const missingTools = requiredTools.filter((name) => !tools.some((tool: { name?: string }) => tool.name === name))
    if (missingTools.length) throw new Error(`MCP 服务缺少工具：${missingTools.join(', ')}`)
    if (tools.some((tool: { name?: string }) => tool.name === 'execute_edit_command')) {
      throw new Error('MCP 服务仍暴露已移除的 execute_edit_command 工具')
    }
    console.log(`MCP 握手成功，已发现 ${tools.length} 个工具。`)

    const assertRejected = async (label: string, name: string, args: Record<string, unknown>) => {
      const response = await request('tools/call', { name, arguments: args })
      if (!response.error && response.result?.isError !== true) {
        throw new Error(`${name} 没有拒绝${label}`)
      }
      return response
    }

    await assertRejected('无效镜像方向', 'mirror_danmakus', { axis: 'diagonal' })
    console.log('Zod 参数校验正常，无效镜像方向已在调用编辑器前拒绝。')

    const invalidCreate = await assertRejected('缺失弹幕输入', 'create_danmakus', { relativeToCurrentTime: false })
    const createErrorText = invalidCreate.result?.content?.find((item: { type?: string }) => item.type === 'text')?.text
    if (!String(createErrorText || invalidCreate.error?.message || '').includes('danmaku')) {
      throw new Error('创建工具没有返回可理解的输入错误')
    }
    await assertRejected('同时传入 danmaku 与 jsonPath', 'create_danmakus', {
      danmaku: {},
      jsonPath: 'demo.json',
      relativeToCurrentTime: false
    })
    await assertRejected('无效弹幕颜色', 'create_danmakus', {
      danmaku: {
        layer: 0,
        startTime: 0,
        content: { text: 'a', font: 'Microsoft YaHei', size: 60, color: 'bad-color', stroke: false },
        transform: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, zRotate: 0, yRotate: 0 },
        opacity: { from: 1, to: 1 },
        animation: { duration: 1000, moveDuration: 500, delay: 0, easing: 'speedup' }
      },
      relativeToCurrentTime: false
    })
    console.log('创建参数检查正常，缺失、冲突与畸形弹幕数据已在调用编辑器前拒绝。')

    await assertRejected('负时间', 'get_frame', { timeMs: -1 })
    console.log('帧截图参数检查正常，负时间已在调用编辑器前拒绝。')

    await assertRejected('未知字段规则', 'create_generated_danmakus', {
      quantity: 1,
      rules: { unsupportedField: { mode: 'range', start: 0, end: 1 } }
    })
    await assertRejected('越界颜色 alpha', 'create_generated_danmakus', {
      quantity: 2,
      rules: { 'content.color': { mode: 'relative', start: '#FFFFFF', target: '#000000', alpha: 1.5 } }
    })
    await assertRejected('无效颜色值', 'create_generated_danmakus', {
      quantity: 1,
      rules: { 'content.color': { mode: 'range', start: 'not-color', target: '#000000' } }
    })
    await assertRejected('inputPath 与 rules 混用', 'create_generated_danmakus', {
      inputPath: 'rules.json',
      quantity: 1,
      rules: { startTime: { mode: 'range', start: 0, end: 100 } }
    })
    await assertRejected('缺少 rules 且无 inputPath', 'create_generated_danmakus', {
      quantity: 1
    })
    await assertRejected('quantity 超过 10000 上限', 'create_generated_danmakus', {
      quantity: 10_001,
      rules: { startTime: { mode: 'range', start: 0, end: 100 } }
    })
    console.log('生成规则参数检查正常，未知字段、无效颜色、越界数量与文件互斥已在调用编辑器前拒绝。')

    await assertRejected('空 steps 数组', 'apply_field_updates', { steps: [] })
    await assertRejected('steps 与 inputPath 混用', 'apply_field_updates', {
      steps: [[{ field: 'startTime', method: '100' }]],
      inputPath: 'steps.json'
    })
    await assertRejected('缺少 steps 与 inputPath', 'apply_field_updates', {})
    await assertRejected('无效 upset 混合参数', 'apply_field_updates', {
      steps: [[{ field: 'transform.start.x', method: { op: 'upset', expr: '$startX' } }]]
    })
    await assertRejected('同一步内重复字段', 'apply_field_updates', {
      steps: [[
        { field: 'startTime', method: '100' },
        { field: 'startTime', method: '+50' }
      ]]
    })
    await assertRejected('内部命令字段名', 'apply_field_update', {
      field: '@danmaku.delete',
      method: '1'
    })
    console.log('字段更新参数检查正常，非法字段、同一步重复字段、文件互斥与无效 upset 已在调用编辑器前拒绝。')

    await assertRejected('缺少测量内容', 'measure_text', {})
    await assertRejected('text 与 inputPath 混用', 'measure_text', {
      text: 'hello',
      inputPath: 'items.json'
    })
    await assertRejected('inputPath 混用顶层 size 参数', 'measure_text', {
      inputPath: 'items.json',
      size: 40
    })
    await assertRejected('items 混用顶层 size 参数', 'measure_text', {
      items: [{ text: 'hello' }],
      size: 40
    })
    await assertRejected('过小字号 size < 1', 'measure_text', { text: 'hello', size: 0.2 })
    console.log('文字测量参数检查正常，缺少内容、混用参数与过小字号已在调用编辑器前拒绝。')

    await assertRejected('空白 ids 元素', 'list_danmakus', { ids: ['  '] })
    await assertRejected('ids 与 idsPath 混用', 'list_danmakus', { ids: '1~3', idsPath: 'ids.json' })
    await assertRejected('idsOnly 与 outputPath 混用', 'list_danmakus', { idsOnly: true, outputPath: 'out.json' })
    await assertRejected('超限 limit', 'list_danmakus', { limit: 501 })
    await assertRejected('ids 与 inputPath 混用', 'delete_danmakus', { ids: '1~3', inputPath: 'ids.json' })
    await assertRejected('空白筛选命令', 'select_by_command', { command: '   ' })
    await assertRejected('空编辑器设置对象', 'update_editor_settings', {})
    await assertRejected('非法运动角度', 'set_movement_length', { length: 100, angle: 'abc' })
    await assertRejected('非法描边颜色', 'apply_stroke', { width: 2, color: 'red' })
    await assertRejected('空白 snapshotId', 'get_history_snapshot', { snapshotId: '   ' })
    await assertRejected('无 outputPath 时 snapshot limit 超限', 'get_history_snapshot', { snapshotId: 'snap_1', limit: 501 })
    await assertRejected('无 outputPath 时日志 limit 超限', 'get_editor_logs', { limit: 501 })
    await assertRejected('空 get_frame outputPath', 'get_frame', { timeMs: 0, outputPath: '   ' })

    const copyTool = tools.find((tool: { name?: string }) => tool.name === 'copy_coordinates') as
      | { inputSchema?: { required?: string[] } }
      | undefined
    if (copyTool?.inputSchema?.required?.includes('direction')) {
      throw new Error('copy_coordinates.direction 不应为必填字段')
    }
    console.log('查询、筛选、工具栏与坐标复制参数校验正常。')

    await assertRejected('同时指定 fromCurrent 和 fromProjectPath', 'create_folder_project', {
      name: 'demo',
      fromCurrent: true,
      fromProjectPath: 'demo.json'
    })
    await assertRejected('缺少待更新字段', 'edit_folder_project', { projectPath: 'demo' })
    await assertRejected('空白工程名称', 'check_folder_project_path', { name: '   ' })
    await assertRejected('未知参数', 'reload_app', { unexpected: true })

    const statusTool = tools.find((tool: { name?: string }) => tool.name === 'get_video_export_status') as
      | { annotations?: { readOnlyHint?: boolean } }
      | undefined
    if (statusTool?.annotations?.readOnlyHint !== true) {
      throw new Error('get_video_export_status 没有声明 readOnlyHint=true')
    }
    for (const [label, name, args] of [
      ['非 .mp4 路径', 'export_video', { outputPath: 'demo.mov' }],
      ['奇数宽度', 'export_video', { outputPath: 'demo.mp4', width: 1921 }],
      ['无效时间范围', 'export_video', { outputPath: 'demo.mp4', startMs: 1000, endMs: 500 }],
      ['不支持的帧率', 'export_video', { outputPath: 'demo.mp4', fps: 50 }],
      ['越界 waitMs', 'get_video_export_status', { waitMs: 70000 }],
      ['空 jobId', 'cancel_video_export', { jobId: '   ' }]
    ] as const) {
      await assertRejected(label, name, args)
    }
    console.log('文件系统、视频导出与重启工具参数检查正常，无效组合与未知参数已在调用编辑器前拒绝。')

    const state = await request('tools/call', { name: 'get_editor_state', arguments: {} })
    if (state.error) throw new Error(state.error.message)
    if (state.result?.isError) {
      const message = state.result.content?.find((item: { type?: string }) => item.type === 'text')?.text || '未知错误'
      if (String(message).includes('编辑器服务离线')) {
        console.log(`MCP 工具调用成功；当前没有检测到运行中的 m7-editor 会话（${message}）。启动 npm run tauri dev 后再运行本检查即可验证桥接。`)
        return
      }
      throw new Error(String(message))
    }
    const stateText = state.result?.content?.find((item: { type?: string }) => item.type === 'text')?.text || ''
    assert.equal(state.result?.structuredContent, undefined, 'MCP 返回不应重复附带 structuredContent')
    assert.ok(!stateText.includes('\n'), 'MCP 返回应使用紧凑单行 JSON')
    const parsedState = JSON.parse(stateText) as { selectedIds?: unknown }
    assert.equal(typeof parsedState.selectedIds, 'string', 'selectedIds 应返回压缩范围字符串')
    console.log('MCP 工具调用成功，当前编辑器状态：')
    console.log(stateText || '(无文本结果)')
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
