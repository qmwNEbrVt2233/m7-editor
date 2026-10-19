import { randomUUID } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { z } from 'zod'

type BridgeDescriptor = { port: number; token: string; pid?: number }

const APP_IDENTIFIER = 'com.jerryeee.m7-editor'

function appMcpDescriptorDirectory(): string {
  let configDirectory: string
  if (process.platform === 'win32') {
    configDirectory = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
  } else if (process.platform === 'darwin') {
    configDirectory = join(homedir(), 'Library', 'Application Support')
  } else {
    configDirectory = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  }
  return join(configDirectory, APP_IDENTIFIER, 'mcp')
}

async function readBridgeDescriptors(): Promise<BridgeDescriptor[]> {
  const override = process.env.M7_EDITOR_MCP_DESCRIPTOR
  if (override) {
    return [JSON.parse(await readFile(override, 'utf8')) as BridgeDescriptor]
  }
  const descriptorDirectories = [...new Set([appMcpDescriptorDirectory(), tmpdir()])]
  const namesByDirectory = await Promise.all(descriptorDirectories.map(async (directory) => {
    try {
      const names = await readdir(directory)
      return names
        .filter((name) => /^m7-editor-mcp-bridge-[a-f0-9]{24}\.json$/.test(name))
        .map((name) => ({ directory, name }))
    } catch {
      return []
    }
  }))
  const candidateResults = await Promise.all(namesByDirectory.flat().map(async ({ directory, name }) => {
    const path = join(directory, name)
    try {
      return { path, modifiedAt: (await stat(path)).mtimeMs }
    } catch {
      return null
    }
  }))
  const candidates = candidateResults.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
  const descriptors: BridgeDescriptor[] = []
  for (const candidate of candidates) {
    try {
      const descriptor = JSON.parse(await readFile(candidate.path, 'utf8')) as BridgeDescriptor
      if (Number.isInteger(descriptor.port) && descriptor.port > 0 && descriptor.port <= 65535 && typeof descriptor.token === 'string') {
        if (Number.isInteger(descriptor.pid) && descriptor.pid! > 0) {
          try {
            process.kill(descriptor.pid!, 0)
          } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH') continue
          }
        }
        descriptors.push(descriptor)
      }
    } catch {
      // Ignore partial or stale descriptor files and try the next recent editor session.
    }
  }
  return descriptors
}

async function callEditor(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  let descriptors: BridgeDescriptor[]
  try {
    descriptors = await readBridgeDescriptors()
  } catch {
    throw new Error('编辑器服务离线：请先启动 m7-editor 桌面应用；MCP 已检查应用配置目录和系统临时目录')
  }
  if (!descriptors.length) {
    throw new Error('编辑器服务离线：未在应用配置目录或系统临时目录找到会话描述文件；请重启 m7-editor')
  }

  const requestBody = JSON.stringify({ requestId: randomUUID(), method, params })
  if (Buffer.byteLength(requestBody, 'utf8') > 900 * 1024) {
    throw new Error('MCP 桥接请求超过 900 KiB，请减少弹幕数量或缩小 JSON 文件')
  }

  let reachableBridge = false
  for (const descriptor of descriptors) {
    let response: Response
    try {
      response = await fetch('http://127.0.0.1:' + descriptor.port + '/rpc', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + descriptor.token,
          'content-type': 'application/json'
        },
        body: requestBody,
        signal: AbortSignal.timeout(method === 'editor.captureFrame' ? 95_000 : 35_000)
      })
    } catch {
      continue
    }
    reachableBridge = true

    let payload: { result?: unknown; error?: string }
    try {
      payload = await response.json() as { result?: unknown; error?: string }
    } catch {
      throw new Error('编辑器桥接返回了无效响应（HTTP ' + response.status + '）')
    }
    if (response.status === 401) continue
    if (!response.ok || payload.error) throw new Error(payload.error || '编辑器桥接调用失败（HTTP ' + response.status + '）')
    return payload.result
  }
  if (reachableBridge) {
    throw new Error('编辑器服务离线：找到桥接描述文件，但没有可用的鉴权会话；请重启 m7-editor')
  }
  throw new Error(`编辑器服务无响应：找到 ${descriptors.length} 个桥接描述文件，但对应的本机端口不可达；请重启 m7-editor`)
}

const MAX_DANMAKU_JSON_BYTES = 900 * 1024

function extractDanmakuDrafts(parsed: unknown): Record<string, unknown>[] {
  let drafts: unknown[]
  if (Array.isArray(parsed)) {
    drafts = parsed
  } else if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record.danmakus)) drafts = record.danmakus
    else drafts = [record]
  } else {
    throw new Error('JSON 文件必须包含弹幕对象、弹幕数组，或带 danmakus 数组的工程对象')
  }
  if (drafts.length === 0 || drafts.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('JSON 文件中没有有效的弹幕对象')
  }
  return drafts as Record<string, unknown>[]
}

async function loadDanmakuDrafts(input: { danmaku?: Record<string, unknown> | Record<string, unknown>[]; jsonPath?: string }) {
  const hasObject = input.danmaku !== undefined
  const hasPath = typeof input.jsonPath === 'string' && input.jsonPath.trim().length > 0
  if (hasObject === hasPath) throw new Error('请在 danmaku 对象和 jsonPath 路径中二选一')
  if (hasObject) return extractDanmakuDrafts(input.danmaku)

  const path = resolve(input.jsonPath!.trim())
  let fileStat
  try {
    fileStat = await stat(path)
  } catch (error) {
    throw new Error(`无法读取 JSON 文件：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!fileStat.isFile()) throw new Error('jsonPath 必须指向一个文件')
  if (fileStat.size > MAX_DANMAKU_JSON_BYTES) throw new Error('JSON 文件不能超过 900 KiB')
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch (error) {
    throw new Error(`JSON 文件格式无效：${error instanceof Error ? error.message : String(error)}`)
  }
  return extractDanmakuDrafts(parsed)
}

const emptyInput = z.strictObject({})
const scopeInput = z.enum(['S', 'E', 'B']).describe('S 仅起始坐标，E 仅结束坐标，B 两端坐标')

function resultForMcp(value: unknown) {
  const result = value as { ok?: boolean; message?: string } | null
  const isError = result?.ok === false
  if (
    value && typeof value === 'object' &&
    typeof (value as Record<string, unknown>).dataBase64 === 'string' &&
    typeof (value as Record<string, unknown>).mimeType === 'string'
  ) {
    const frame = value as {
      dataBase64: string
      mimeType: string
      width: number
      height: number
      timeMs: number
    }
    const metadata = {
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
      timeMs: frame.timeMs
    }
    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(metadata, null, 2) },
        { type: 'image' as const, data: frame.dataBase64, mimeType: frame.mimeType }
      ],
      structuredContent: metadata
    }
  }
  const text = isError ? result.message || '编辑失败' : JSON.stringify(value, null, 2)
  const structuredContent = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
  return {
    content: [{ type: 'text' as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
    isError
  }
}

function createMcpServer() {
  const server = new McpServer({ name: 'm7-editor', version: '1.10.0' }, {
    capabilities: { tools: {} },
    instructions: '控制当前运行的 m7-editor 编辑会话。字段、工具栏、弹幕创建/删除、播放头和画布设置最终统一通过 applyFieldUpdate 操作；普通编辑默认作用于当前选择。create_generated_danmakus 使用 creationTools 的生成规则；get_frame 返回指定时间的图片内容，供视觉模型检查。保存/备份仅支持文件夹工程。先用 list_history_snapshots 获取快照 ID，再查询详情。'
  })

  function registerTool<Schema extends z.ZodType>(
    name: string,
    title: string,
    description: string,
    inputSchema: Schema,
    invoke: (input: z.output<Schema>) => Promise<unknown>,
    readOnly = false
  ) {
    server.registerTool(name, {
      title,
      description,
      inputSchema,
      ...(readOnly ? { annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true } } : {})
    }, async (input) => {
      try {
        return resultForMcp(await invoke(input as z.output<Schema>))
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
          isError: true
        }
      }
    })
  }

  registerTool(
    'get_editor_state',
    '读取编辑器状态',
    '读取当前运行的 m7-editor 会话、工程、播放头、画布和选择状态。',
    emptyInput,
    () => callEditor('editor.getState'),
    true
  )
  registerTool(
    'get_frame',
    '获取指定时间帧',
    '在指定时间渲染当前工程画面，并以 MCP 图片内容返回，供支持图片输入的模型检查。不会移动主窗口播放头或修改工程；maxDimension 默认 1280，最大 1920。',
    z.strictObject({
      timeMs: z.number().nonnegative().describe('时间轴位置，单位毫秒'),
      maxDimension: z.number().int().min(16).max(1920).default(1280).describe('输出图像最长边像素；超过工程画布尺寸时会等比缩小')
    }),
    (input) => callEditor('editor.captureFrame', input),
    true
  )
  registerTool(
    'list_danmakus',
    '读取弹幕',
    '分页读取当前选择中的弹幕；selectedOnly=false 时读取工程中的全部弹幕。',
    z.strictObject({
      ids: z.array(z.string()).optional().describe('可选的弹幕 ID 白名单'),
      selectedOnly: z.boolean().default(true).describe('是否只读当前选择'),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(100)
    }),
    (input) => callEditor('editor.getDanmakus', input),
    true
  )
  registerTool(
    'apply_field_update',
    '更新弹幕字段',
    '通过统一编辑 API 修改当前选择的字段。支持赋值、相对运算、随机值和以 $ 开头的数学表达式。',
    z.strictObject({
      field: z.string().describe('字段路径，例如 transform.start.x、content.text、opacity.from'),
      method: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())])
        .describe('字段输入值或操作方法；数字字段支持 +2、* 等规则及 $表达式')
    }),
    (input) => callEditor('editor.applyFieldUpdate', input)
  )
  const danmakuObjectInput = z.record(z.string(), z.unknown())
  const numericGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('range'),
      start: z.number(),
      end: z.number(),
      expression: z.string().optional().describe('可选数学表达式；支持 S、E、i、n、t、width、height 及其他字段路径')
    }),
    z.strictObject({
      mode: z.literal('relative'),
      start: z.number(),
      step: z.union([z.number(), z.string()]).describe('creationTools 相对步长，例如 +20、*1.1')
    }),
    z.strictObject({
      mode: z.literal('cycle'),
      values: z.array(z.union([z.number(), z.string()])).min(1).max(1000)
    })
  ])
  const colorGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('range'), start: z.string(), target: z.string() }),
    z.strictObject({ mode: z.literal('relative'), start: z.string(), target: z.string(), alpha: z.union([z.number(), z.string()]) }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.string()).min(1).max(1000) })
  ])
  const textGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.string().describe('文字；可使用反引号模板，例如 `第 ${i + 1} 条`') }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.string()).min(1).max(1000) })
  ])
  const fontGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.string() }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.string()).min(1).max(1000) })
  ])
  const strokeGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.boolean() }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.boolean()).min(1).max(1000) })
  ])
  const easingGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({ mode: z.literal('assign'), value: z.enum(['speedup', 'speeddown']) }),
    z.strictObject({ mode: z.literal('cycle'), values: z.array(z.enum(['speedup', 'speeddown'])).min(1).max(1000) })
  ])
  const generationRules = z.strictObject({
    layer: numericGenerationRule.optional(),
    startTime: numericGenerationRule.optional(),
    'content.size': numericGenerationRule.optional(),
    'transform.start.x': numericGenerationRule.optional(),
    'transform.start.y': numericGenerationRule.optional(),
    'transform.end.x': numericGenerationRule.optional(),
    'transform.end.y': numericGenerationRule.optional(),
    'transform.zRotate': numericGenerationRule.optional(),
    'transform.yRotate': numericGenerationRule.optional(),
    'opacity.from': numericGenerationRule.optional(),
    'opacity.to': numericGenerationRule.optional(),
    'animation.duration': numericGenerationRule.optional(),
    'animation.moveDuration': numericGenerationRule.optional(),
    'animation.delay': numericGenerationRule.optional(),
    'content.color': colorGenerationRule.optional(),
    'content.text': textGenerationRule.optional(),
    'content.font': fontGenerationRule.optional(),
    'content.stroke': strokeGenerationRule.optional(),
    'animation.easing': easingGenerationRule.optional()
  }).refine((rules) => Object.values(rules).some((rule) => rule !== undefined), 'rules 至少需要提供一个字段规则')

  registerTool(
    'create_generated_danmakus',
    '按 creationTools 规则生成弹幕',
    '用 creationTools 同一规则引擎批量生成并创建弹幕。提供 quantity 和任意字段 rules；未指定字段沿用界面默认值。数字字段支持 range（均匀范围或 expression）、relative（起始值加步长）和 cycle；颜色支持范围渐变、Alpha 混合和循环；文本/字体/描边/缓动支持赋值或循环。表达式可引用 S、E、i、n、t、width、height 和其他字段路径。默认保留绝对 startTime；relativeToCurrentTime=true 时使用 insertDanmakus 的播放头偏移和层级分配。新弹幕会自动选中。',
    z.strictObject({
      quantity: z.number().int().min(1).max(1000),
      relativeToCurrentTime: z.boolean().default(false),
      rules: generationRules
    }),
    (input) => callEditor('editor.createGeneratedDanmakus', input)
  )

  registerTool(
    'create_danmakus',
    '创建弹幕',
    '从直接传入的弹幕对象/数组或本机 JSON 文件创建弹幕。relativeToCurrentTime=true 时按 insertDanmakus 的规则把最早弹幕对齐到当前播放头并分配层级；false 时保留绝对 startTime，仅分配新 ID 后添加。输入中的 id 会被忽略。',
    z.strictObject({
      danmaku: z.union([danmakuObjectInput, z.array(danmakuObjectInput)]).optional().describe('一个弹幕对象或弹幕对象数组'),
      jsonPath: z.string().optional().describe('本机 JSON 文件路径；相对路径以 MCP 工作目录为基准。支持弹幕对象、弹幕数组或包含 danmakus 数组的工程 JSON'),
      relativeToCurrentTime: z.boolean().describe('是否相对当前播放头创建；必须明确传入 true 或 false')
    }),
    async (input) => {
      const danmakus = await loadDanmakuDrafts(input)
      return callEditor('editor.applyFieldUpdate', {
        field: '@danmaku.create',
        method: { danmakus, relativeToCurrentTime: input.relativeToCurrentTime }
      })
    }
  )
  registerTool(
    'delete_danmakus',
    '删除弹幕',
    '删除指定 ID 的弹幕；不传 ids 时删除当前选择。若任一指定 ID 不存在，会整批拒绝且不做部分删除。',
    z.strictObject({ ids: z.array(z.string()).min(1).optional().describe('可选的弹幕 ID 列表；省略时使用当前选择') }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@danmaku.delete', method: input })
  )
  registerTool(
    'update_current_time',
    '设置当前播放时间',
    '设置当前时间轴播放头位置，单位为毫秒。',
    z.strictObject({ currentTime: z.number().nonnegative() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@editor.currentTime', method: input.currentTime })
  )
  registerTool(
    'update_editor_settings',
    '设置画布和层数',
    '更新画布屏幕宽高和/或最大层数。宽高最小为 10；最大层数不能低于现有弹幕使用的层数。',
    z.strictObject({
      screenWidth: z.number().positive().optional(),
      screenHeight: z.number().positive().optional(),
      maxLayers: z.number().positive().optional()
    }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@editor.settings', method: input })
  )
  registerTool(
    'save_folder_project',
    '保存文件夹工程',
    '将当前工程保存到已打开的文件夹工程目录。单文件工程会返回明确错误。',
    emptyInput,
    () => callEditor('editor.saveFolderProject')
  )
  registerTool(
    'backup_folder_project',
    '备份文件夹工程',
    '保存当前工程并在文件夹工程的 backup 目录创建备份。单文件工程会返回明确错误。',
    emptyInput,
    () => callEditor('editor.backupFolderProject')
  )
  registerTool(
    'get_editor_logs',
    '查询编辑器日志',
    '读取当前运行会话中最近的界面日志，按时间倒序返回；不会读取磁盘上的旧日志文件。',
    z.strictObject({
      type: z.enum(['info', 'success', 'warn', 'error']).optional(),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(100)
    }),
    (input) => callEditor('editor.getLogs', input),
    true
  )
  registerTool(
    'list_history_snapshots',
    '列出历史快照',
    '列出当前内存撤销历史中的快照 ID、时间、说明和涉及的弹幕 ID。',
    emptyInput,
    () => callEditor('editor.getHistorySnapshots'),
    true
  )
  registerTool(
    'get_history_snapshot',
    '查询历史快照弹幕',
    '按快照 ID 查询该历史状态中的弹幕详情，支持 offset/limit 分页。先调用 list_history_snapshots 获取快照 ID。',
    z.strictObject({
      snapshotId: z.string().min(1),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(500).default(100)
    }),
    (input) => callEditor('editor.getHistorySnapshot', input),
    true
  )
  registerTool(
    'select_by_command',
    '按条件筛选弹幕',
    '使用工具栏现有 /s 命令语法更新选择范围。',
    z.strictObject({ command: z.string().describe('以 /s 开头的筛选命令') }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@selection.filter', method: { command: input.command } })
  )
  registerTool(
    'execute_edit_command',
    '执行工具栏命令',
    '执行工具栏数字字段表达式命令，例如：startX = startX + 20;zRotate = 90，与 apply_field_update 表达式的区别是这个可以同时执行多条赋值规则，在引用被赋值字段时使用原值而非赋值后的值',
    z.strictObject({ command: z.string() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.command', method: { command: input.command } })
  )
  registerTool(
    'apply_stroke',
    '生成描边弹幕',
    '为当前选择生成描边副本。',
    z.strictObject({ width: z.number().min(1), color: z.string() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.stroke', method: input })
  )
  registerTool(
    'center_danmakus',
    '弹幕居中',
    '按画布尺寸和文字测量结果将当前选择水平或垂直居中。测量失败时整次操作取消。axis=x 表示垂直居中，axis=y 表示水平居中。',
    z.strictObject({ axis: z.enum(['x', 'y']), scope: scopeInput.optional() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.center', method: input })
  )
  registerTool(
    'copy_coordinates',
    '复制弹幕坐标',
    '在每条当前选择的弹幕内部复制起始坐标或结束坐标。',
    z.strictObject({ direction: z.enum(['startToEnd', 'endToStart']).optional() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.copy', method: input })
  )
  registerTool(
    'swap_coordinates',
    '互换弹幕坐标',
    '互换当前选择的起始坐标与结束坐标。',
    emptyInput,
    () => callEditor('editor.applyFieldUpdate', { field: '@toolbar.swap', method: {} })
  )
  registerTool(
    'mirror_danmakus',
    '镜像弹幕',
    '按画布宽度或高度镜像当前选择。',
    z.strictObject({ axis: z.enum(['horizontal', 'vertical']) }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.mirror', method: input })
  )
  registerTool(
    'calculate_rotation',
    '根据坐标计算旋转角',
    '根据当前选择的起点和终点重新计算 Z 轴旋转角。',
    emptyInput,
    () => callEditor('editor.applyFieldUpdate', { field: '@toolbar.calculateRotation', method: {} })
  )
  registerTool(
    'set_movement_length',
    '设置弹幕运动长度',
    '保留起点，按长度和角度设置当前选择的终点坐标。角度留空时沿用弹幕现有角度。',
    z.strictObject({ angle: z.string().default(''), length: z.number() }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.length', method: input })
  )
  registerTool(
    'lock_movement_angle',
    '锁定运动角度',
    '在指定坐标轴变化后投影另一个坐标，保持角度不变。angle 可留空沿用弹幕旋转角，也可传绝对角度或相对角度。',
    z.strictObject({ changedAxis: z.enum(['x', 'y']), angle: z.string().default('') }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.lockAngle', method: input })
  )
  registerTool(
    'split_danmakus',
    '分割弹幕',
    '将当前选择按行、按字或按播放头时间点分割。按字分割依赖界面文字测量，测量失败时整次操作取消。',
    z.strictObject({ mode: z.enum(['line', 'letter', 'time']) }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@toolbar.split', method: input })
  )
  registerTool(
    'undo_edit',
    '撤销编辑',
    '撤销最近一次独立编辑操作。',
    emptyInput,
    () => callEditor('editor.applyFieldUpdate', { field: '@history.undo', method: null })
  )
  registerTool(
    'redo_edit',
    '重做编辑',
    '重做最近撤销的编辑操作。',
    emptyInput,
    () => callEditor('editor.applyFieldUpdate', { field: '@history.redo', method: null })
  )

  return server
}

serveStdio(createMcpServer, {
  onerror: (error) => console.error('[m7-editor MCP] stdio 协议错误：', error.message)
})
console.error('[m7-editor MCP] stdio 服务已启动，正在等待 MCP 客户端请求。')
