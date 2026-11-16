import { randomUUID } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'
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

const longBridgeMethods = new Set([
  'editor.captureFrame',
  'editor.exportVideo',
  'editor.getVideoExportStatus',
  'editor.cancelVideoExport'
])

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
        signal: AbortSignal.timeout(longBridgeMethods.has(method) ? 95_000 : 35_000)
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

function resolveRequiredPath(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${label}不能为空`)
  }
  return resolve(trimmed)
}

function resolveOptionalPath(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? resolve(trimmed) : undefined
}

function createMcpServer() {
  const server = new McpServer({ name: 'm7-editor', version: '1.12.0' }, {
    capabilities: { tools: {} },
    instructions: '控制当前运行的 m7-editor 编辑会话。当 get_editor_state 返回 ready=false 时，可先调用工具打开或创建工程。字段、工具栏、弹幕创建/删除、播放头和画布设置最终统一通过 applyFieldUpdate 操作；普通编辑默认作用于当前选择。使用 create_generated_danmakus 按规则批量生成；get_frame 返回指定时间的图片内容，供视觉模型检查。export_video 异步/短等待导出 .mp4 视频（必填 outputPath，开始后锁定弹幕快照不阻塞继续编辑），配合 get_video_export_status 与 cancel_video_export 查询和取消。保存/备份仅支持文件夹工程。先用 list_history_snapshots 获取快照 ID，再查询详情。reload_app 会调用 window.location.reload() 清空内存历史快照与未保存状态，仅在需从本地更新工程信息时使用。'
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
    '读取当前运行的 m7-editor 会话、工程、播放头、画布、媒体信息（media）、时间轴弹幕范围（timelineRange）、视频导出设置与状态（useWebglVideoExport / videoExport）和选择状态。',
    emptyInput,
    () => callEditor('editor.getState'),
    true
  )
  const measureTextEntryInput = z.strictObject({
    text: z.string().describe('要测量的弹幕文本（支持 \\n 换行）'),
    font: z.string().default('Microsoft YaHei').describe('字体名称，默认 Microsoft YaHei'),
    size: z.number().positive().default(60).describe('字号（像素），默认 60'),
    zRotate: z.number().default(0).describe('Z 轴旋转角度（度），默认 0'),
    stroke: z.boolean().default(false).describe('是否开启描边，默认 false')
  })
  registerTool(
    'measure_text',
    '测量文字渲染尺寸',
    '只读测量弹幕文本在当前编辑器渲染层的实际像素宽高（rawWidth/rawHeight）、Z 轴旋转后包围盒宽高（width/height）以及居中参考坐标（centerX/centerY）。不创建或修改任何弹幕。传入 text 测单条，或传入 items 批量测量。',
    z.strictObject({
      text: z.string().optional().describe('单条测量时的文本；与 items 二选一'),
      font: z.string().default('Microsoft YaHei').describe('单条测量时的字体，默认 Microsoft YaHei'),
      size: z.number().positive().default(60).describe('单条测量时的字号（像素），默认 60'),
      zRotate: z.number().default(0).describe('单条测量时的 Z 轴旋转角度（度），默认 0'),
      stroke: z.boolean().default(false).describe('单条测量时是否开启描边，默认 false'),
      items: z.array(measureTextEntryInput).min(1).max(100).optional().describe('批量测量的条目数组；与 text 二选一')
    }).refine((input) => (input.text !== undefined) !== (input.items !== undefined), '请在 text 和 items 中二选一'),
    (input) => callEditor('editor.measureText', input),
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
  const upsetMethodInput = z.strictObject({
    op: z.literal('upset'),
    seed: z.number().optional().describe('可选随机种子；传入后可复现相同的打乱顺序')
  }).describe('在当前选择内随机打乱该字段现有值（仅限传此对象，不能与表达式或赋值混用；避免与文本内容 "upset" 混淆）')
  const fieldMethodInput = z.union([z.string(), z.number(), z.boolean(), upsetMethodInput])

  registerTool(
    'apply_field_update',
    '更新弹幕字段',
    '通过统一编辑 API 修改当前选择的单个字段。支持文本/颜色/字体/描边/缓动/数值赋值、相对运算、随机值、$ 数学表达式，或传入 { "op": "upset", "seed?": 数字 } 在当前选择内随机打乱该字段值（与赋值/表达式互斥；对文本字段需显式传此对象，纯字符串 "upset" 会按字面文本写入）。',
    z.strictObject({
      field: z.string().describe('字段路径，例如 transform.start.x、content.text、opacity.from'),
      method: fieldMethodInput
        .describe('字段输入值/操作方法（数字字段支持 +2、* 等规则及 $表达式），或 { "op": "upset", "seed?": 数字 }')
    }),
    (input) => callEditor('editor.applyFieldUpdate', input)
  )
  const fieldUpdateItemInput = z.strictObject({
    field: z.string().describe('字段路径，例如 transform.start.x、content.text、opacity.from'),
    method: fieldMethodInput
      .describe('赋值/运算/随机/$表达式，或 { "op": "upset", "seed?": 数字 }（与表达式互斥）')
  })
  registerTool(
    'apply_field_updates',
    '批量分步更新多个弹幕字段',
    '在单次原子操作（单个撤销步骤）中，按二维数组 steps 分步更新当前选择的多个字段（支持数值、文本、字体、颜色、描边、缓动及 upset 打乱）。外层 steps 按顺序串行执行（后一步的表达式可读到前一步的新值）；同一内层步骤中的多条规则共享该步开始前的原值快照（适合变量交叉引用或互换），且单步内不能重复更新同一字段；任一项失败时整批回滚。',
    z.strictObject({
      steps: z.array(
        z.array(fieldUpdateItemInput).min(1).max(50).describe('同一执行步内的更新列表；同一步内共享步前原值快照，字段不可重复')
      ).min(1).max(50).describe('按顺序执行的步骤二维数组，例如 [[{field:"transform.start.x",method:"$endX"},{field:"transform.end.x",method:"$startX"}], [{field:"content.text",method:{op:"upset"}}]]')
    }).refine(
      (input) => input.steps.reduce((total, step) => total + step.length, 0) <= 200,
      '所有步骤的更新条目总数不能超过 200'
    ),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@danmaku.updateFields', method: input })
  )
  const danmakuObjectInput = z.record(z.string(), z.unknown())
  const numericGenerationRule = z.discriminatedUnion('mode', [
    z.strictObject({
      mode: z.literal('range'),
      start: z.number(),
      end: z.number(),
      expression: z.string().optional().describe('可选数学表达式；支持 S、E、i、n、t、width、height、bezier(...)、seededRandom(seed, index?) 及其他字段路径')
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
    '用 creationTools 同一规则引擎批量生成并创建弹幕。提供 quantity 和任意字段 rules；未指定字段沿用界面默认值。数字字段支持 range（均匀范围或 expression）、relative（起始值加步长）和 cycle；颜色支持范围渐变、Alpha 混合和循环；文本/字体/描边/缓动支持赋值或循环。表达式可引用 S、E、i、n、t、width、height、bezier(...)、seededRandom(seed, index?) 和其他字段路径。默认保留绝对 startTime；relativeToCurrentTime=true 时使用 insertDanmakus 的播放头偏移和层级分配。新弹幕会自动选中。',
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
    '更新画布屏幕宽高和/或最大层数。宽高最小为 10；最大层数决定自动分配层级的上限',
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
    'get_file_system_state',
    '获取工程文件系统状态',
    '读取应用配置路径、日志目录、默认文件夹工程目录、全局设置以及已注册的文件夹工程列表，并同步刷新界面的工程管理列表；在 ready 为 false 时也可调用。',
    emptyInput,
    () => callEditor('editor.getFileSystemState'),
    true
  )
  registerTool(
    'check_folder_project_path',
    '检查文件夹工程路径',
    '检查指定父目录（省略时使用默认工程目录）下按工程名称安全化后的文件夹工程路径是否已存在。',
    z.strictObject({
      name: z.string().trim().min(1),
      parentDir: z.string().optional()
    }),
    (input) => callEditor('editor.checkFolderProjectPath', {
      name: input.name,
      parentDir: resolveOptionalPath(input.parentDir)
    }),
    true
  )
  registerTool(
    'create_folder_project',
    '创建文件夹工程',
    '创建文件夹工程并立即加载到编辑器（同 UI 手动创建：切换到新工程、重置历史快照、刷新工程列表并关闭工程管理弹窗）。可通过 fromCurrent 从当前画布创建，或通过 fromProjectPath 从已有 JSON 工程文件创建，或留空创建默认空白工程；支持在 ready 为 false 时调用。',
    z.strictObject({
      name: z.string().trim().min(1),
      parentDir: z.string().optional(),
      fromCurrent: z.boolean().optional(),
      fromProjectPath: z.string().optional(),
      mediaPath: z.string().optional(),
      copyMedia: z.boolean().default(true),
      description: z.string().optional()
    }).superRefine((value, context) => {
      if (value.fromCurrent && value.fromProjectPath?.trim()) {
        context.addIssue({ code: 'custom', message: 'fromCurrent 与 fromProjectPath 不能同时指定' })
      }
    }),
    (input) => callEditor('editor.createFolderProject', {
      name: input.name,
      parentDir: resolveOptionalPath(input.parentDir),
      fromCurrent: input.fromCurrent ?? false,
      fromProjectPath: resolveOptionalPath(input.fromProjectPath),
      mediaPath: resolveOptionalPath(input.mediaPath),
      copyMedia: input.copyMedia,
      description: input.description
    })
  )
  registerTool(
    'load_folder_project',
    '加载文件夹工程',
    '按工程文件夹路径加载已注册或有效的文件夹工程，重置历史快照、刷新工程列表并关闭工程管理弹窗（非阻塞，不弹确认框）；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    (input) => callEditor('editor.loadFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    })
  )
  registerTool(
    'import_folder_project',
    '导入文件夹工程',
    '按本地文件夹路径导入外部文件夹工程，将其注册到应用工程列表并立即加载到编辑器（重置历史快照、刷新工程列表并关闭工程管理弹窗）；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    (input) => callEditor('editor.importFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    })
  )
  registerTool(
    'edit_folder_project',
    '编辑文件夹工程配置',
    '编辑文件夹工程的名称、说明、父目录或媒体引用方式（内部拷贝 vs 外部链接），并刷新工程列表。若目标正是当前打开的文件夹工程，会同步更新内存中的工程路径、配置与媒体绑定，同时保留未保存的弹幕编辑；支持在 ready 为 false 时调用。',
    z.strictObject({
      projectPath: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      newParentDir: z.string().optional(),
      mediaUseExternalLink: z.boolean().optional(),
      mediaExternalPath: z.string().optional(),
      description: z.string().optional()
    }).superRefine((value, context) => {
      const hasUpdate = value.name !== undefined
        || value.newParentDir !== undefined
        || value.mediaUseExternalLink !== undefined
        || value.mediaExternalPath !== undefined
        || value.description !== undefined
      if (!hasUpdate) {
        context.addIssue({
          code: 'custom',
          message: '至少需要提供一个待更新字段（name、newParentDir、mediaUseExternalLink、mediaExternalPath 或 description）'
        })
      }
      if (value.newParentDir !== undefined && !value.newParentDir.trim()) {
        context.addIssue({ code: 'custom', message: 'newParentDir 不能为空字符串' })
      }
    }),
    (input) => callEditor('editor.editFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径'),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.newParentDir !== undefined ? { newParentDir: resolveRequiredPath(input.newParentDir, '目标父目录') } : {}),
      ...(input.mediaUseExternalLink !== undefined ? { mediaUseExternalLink: input.mediaUseExternalLink } : {}),
      ...(input.mediaExternalPath !== undefined ? { mediaExternalPath: resolveOptionalPath(input.mediaExternalPath) ?? '' } : {}),
      ...(input.description !== undefined ? { description: input.description } : {})
    })
  )
  registerTool(
    'delete_folder_project',
    '删除文件夹工程',
    '将已注册的文件夹工程移入系统回收站并从工程列表中移除；若删除的正是当前打开的工程，会与界面一致地切换到单文件模式而不覆盖当前内存状态。仅允许删除已注册工程，不会弹出确认框。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    (input) => callEditor('editor.deleteFolderProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程路径')
    })
  )
  registerTool(
    'import_single_project',
    '导入单文件工程（JSON）',
    '读取指定 .json 工程文件并进入单文件模式加载到编辑器（重置历史快照、触发缓冲重构并关闭工程管理弹窗），与工程管理界面顶部的“导入工程”行为一致；支持在 ready 为 false 时调用。',
    z.strictObject({ projectPath: z.string().trim().min(1) }),
    (input) => callEditor('editor.importSingleProject', {
      projectPath: resolveRequiredPath(input.projectPath, '工程文件路径')
    })
  )
  registerTool(
    'import_xml_danmakus',
    '导入 XML 弹幕文件',
    '读取指定 Bilibili .xml 弹幕文件并按当前画布尺寸、XML 偏移设置与最大层数解析，切换到单文件模式、重置历史快照、触发缓冲重构并关闭工程管理弹窗，与工程管理界面顶部的“导入 XML”行为一致；支持在 ready 为 false 时调用。',
    z.strictObject({ xmlPath: z.string().trim().min(1) }),
    (input) => callEditor('editor.importXmlDanmakus', {
      xmlPath: resolveRequiredPath(input.xmlPath, 'XML 文件路径')
    })
  )
  registerTool(
    'skip_folder_project',
    '跳过或关闭工程管理器',
    '与工程管理弹窗右上角“跳过/关闭”按钮行为一致：若当前处于启动初始化阶段（ready 为 false），则跳过文件夹工程并进入单文件模式（如有本地缓存则加载）；否则仅关闭工程管理弹窗。',
    emptyInput,
    () => callEditor('editor.skipFolderProject')
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
    '使用筛选命令语法更新选择范围（MCP 调用可省略开头的 /s，也兼容带 /s 写法）。支持按 id（如 id:"\'1\',\'2\'"）、文本正则、数值范围等条件筛选。',
    z.strictObject({ command: z.string().describe('筛选命令（可省略开头的 /s），例如 id:"\'1\',\'2\'" 或 startTime:"1000~3000"') }),
    (input) => callEditor('editor.applyFieldUpdate', { field: '@selection.filter', method: { command: input.command } })
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
    '按画布尺寸和文字测量结果居中当前选择的 X 或 Y 坐标（含 zRotate 旋转包围盒补偿）。测量失败时整次操作取消。axis=x 居中 X 坐标（将 transform.start.x / transform.end.x 设为 ((screenWidth - box.width) / 2) - box.minX，沿画布垂直中轴线左右居中）；axis=y 居中 Y 坐标（将 transform.start.y / transform.end.y 设为 ((screenHeight - box.height) / 2) - box.minY，沿画布水平中轴线上下居中）。',
    z.strictObject({
      axis: z.enum(['x', 'y']).describe('x：居中 X 坐标（左右居中，对应工具栏“垂直居中”）；y：居中 Y 坐标（上下居中，对应工具栏“水平居中”）'),
      scope: scopeInput.optional()
    }),
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
  registerTool(
    'export_video',
    '导出视频',
    '将当前工程导出为 .mp4 视频。outputPath 必填（绝对或相对路径，必须以 .mp4 结尾，缺失父目录会自动创建）。startMs/endMs 默认为 0 到源视频时长或弹幕最晚结束时间；width/height 默认使用工程画布尺寸（仅传单边时按画布比例自动计算另一边，均须为偶数且比例一致）；fps 默认 60（可选 24/30/60/120）；quality 默认 very-high；useWebgl 默认沿用全局设置（默认开启）。waitMs 默认 15000（0~60000 毫秒）：若在 waitMs 内完成则直接返回结果，超时则在后台继续运行并返回 status=running 与 jobId 供 get_video_export_status 查询。导出锁定开始时刻的弹幕快照，期间可继续编辑或截图。',
    z.object({
      outputPath: z.string().trim().min(1, 'outputPath 不能为空').refine(
        (value) => extname(value).toLowerCase() === '.mp4',
        'outputPath 必须以 .mp4 结尾'
      ),
      startMs: z.number().finite().min(0).optional(),
      endMs: z.number().finite().positive().optional(),
      width: z.number().int().min(16).max(7680).refine((value) => value % 2 === 0, 'width 必须是偶数').optional(),
      height: z.number().int().min(16).max(4320).refine((value) => value % 2 === 0, 'height 必须是偶数').optional(),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60), z.literal(120)]).optional(),
      quality: z.enum(['low', 'high', 'very-high', 'near-lossless']).optional(),
      useWebgl: z.boolean().optional(),
      waitMs: z.number().int().min(0).max(60000).optional()
    }).strict().superRefine((value, context) => {
      if (value.endMs !== undefined && value.startMs !== undefined && value.endMs <= value.startMs) {
        context.addIssue({ code: 'custom', message: 'endMs 必须大于 startMs' })
      }
    }),
    (input) => callEditor('editor.exportVideo', {
      ...input,
      outputPath: resolveRequiredPath(input.outputPath, 'outputPath')
    })
  )
  registerTool(
    'get_video_export_status',
    '查询视频导出状态',
    '只读查询视频导出任务状态与进度。不传 jobId 时返回当前活跃任务或最近一次任务状态；可传入 waitMs（0~60000 毫秒，默认 0）在任务运行中时等待完成或超时再返回最新快照。',
    z.object({
      jobId: z.string().trim().min(1, 'jobId 不能为空').optional(),
      waitMs: z.number().int().min(0).max(60000).optional()
    }).strict(),
    (input) => callEditor('editor.getVideoExportStatus', input),
    true
  )
  registerTool(
    'cancel_video_export',
    '取消视频导出',
    '取消正在进行的视频导出任务并等待编码器、独立渲染窗口和临时文件句柄彻底清理完成后返回。不传 jobId 时取消当前活跃任务；若目标任务已结束则安全返回当前状态。',
    z.object({
      jobId: z.string().trim().min(1, 'jobId 不能为空').optional()
    }).strict(),
    (input) => callEditor('editor.cancelVideoExport', input)
  )
  registerTool(
    'reload_app',
    '重新加载应用（慎用）',
    '调用前端 window.location.reload() 强制刷新整个应用。注意：此操作会清空所有内存历史快照（historySnapshots）和未保存的编辑状态，使应用回到初始启动阶段（ready 变为 false）',
    emptyInput,
    () => callEditor('editor.reloadApp')
  )

  return server
}

serveStdio(createMcpServer, {
  onerror: (error) => console.error('[m7-editor MCP] stdio 协议错误：', error.message)
})
console.error('[m7-editor MCP] stdio 服务已启动，正在等待 MCP 客户端请求。')
