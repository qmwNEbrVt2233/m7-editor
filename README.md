<div align="center">
  <h1>m7-editor<h1>

  <img src="public/favicon.svg" alt="m7-editor"  style="width: 200px; height: 200px;">
  <h3>m7-editor是一个面向 M7 / B 站特效弹幕场景的可视化编辑器</h3>
  <h3>提供音视频预览、时间轴排布、批量属性编辑、工程保存，以及 XML 导入导出能力</h3>

</div>

# 如何使用

- 现提供一键安装使用选择，请从[release](https://github.com/qmwNEbrVt2233/m7-editor/releases)获取最新版本
- 安装包解压后应用程序大小约12mb
- 本项目依赖[webview2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)，若启动后白屏，请检查是否安装了webview，其一般绑定为系统组件，随edge预装。如果你没有，请前往[microsoft webview](https://developer.microsoft.com/en-us/microsoft-edge/webview2/?form=MA13LH#download)下载
- 目前桌面应用支持 windows 与 mac 系统

# 技术栈
[![Vue](https://img.shields.io/badge/-Vue-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Pinia](https://img.shields.io/badge/-Pinia-FFDD5F?style=flat-square&logo=vitest&logoColor=black)](https://pinia.vuejs.org/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
<a href="https://v2.tauri.app/"><img src="https://v2.tauri.app/_astro/logo.BQPqkdSq.svg" style="width: 66px; height: 20px"></a>
<a href="https://mathjs.org/"><img src="https://mathjs.org/css/img/mathjs.svg" style="width: 66px; height: 20px"></a>
<a href="https://mediabunny.dev/"><img src="https://mediabunny.dev/mediabunny-logo.svg" style="width: 20px; height: 20px"></a>
<a href="https://wavesurfer.xyz/"><img src="https://wavesurfer.xyz/logo-small.png" style="width: 20px; height: 20px"></a>

原生 DOM / FileReader / Blob API

# 安装依赖

项目使用 `npm` 管理依赖

```bash
npm install
```

当前主要依赖如下：

- `vue`
- `pinia`
- `vue-router`
- `vite`
- `@vitejs/plugin-vue`
- `mathjs`
- `mediabunny`
- `wavesurfer.js`
- `terser`
- `tauri`
- `@tauri-apps/api`
- `@tauri-apps/cli`
- `@tauri-apps/plugin-clipboard-manager`

建议使用较新的 Node.js 版本运行，以保证与当前 Vite 版本兼容

## 本地运行

启动开发环境：

```bash
npm run dev
```

构建生产版本：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```
<a href="https://v2.tauri.app/"><img src="https://v2.tauri.app/_astro/logo.BQPqkdSq.svg" style="width: 66px; height: 20px"></a>

使用tauri构建应用：

```bash
npm run tauri build
```

启用tauri开发环境：

```bash
npm run tauri dev
```

## MCP 编辑器控制

MCP 服务控制当前运行的桌面编辑器会话。它通过 stdio 与 MCP 客户端通信，再经带随机令牌的本机桥连接正在运行的 Tauri 应用。需要 Node.js 22.6 或更新版本。

编辑器桥只绑定 `127.0.0.1`，端口由系统动态分配（`127.0.0.1:0`），不需要固定端口。应用把端口和随机令牌写入 Tauri 用户配置目录下的 `mcp` 子目录，独立运行的 stdio 服务从同一目录发现当前会话；系统临时目录仅作为旧版本兼容路径。Tauri 桌面应用和 MCP stdio 服务可以分别启动和退出，需在同一 Windows 用户下运行。

### 连接 Codex

在 Codex 桌面端打开 **Settings → MCP servers → Add server**，选择 **STDIO**，填入：

- **Command**：`node`
- **Arguments**：`--experimental-strip-types`、`C:/path/to/m7-editor/src/mcp/server.ts`
- **Working directory**：`C:/path/to/m7-editor`

把示例路径替换为本机仓库的绝对路径，保存后重启 MCP 连接。也可以将下面的配置合并到 `%USERPROFILE%\.codex\config.toml`：

```toml
[mcp_servers.m7-editor]
command = "node"
args = ["--experimental-strip-types", "C:/path/to/m7-editor/src/mcp/server.ts"]
cwd = "C:/path/to/m7-editor"
startup_timeout_sec = 30
tool_timeout_sec = 120
```

Codex 会负责启动 stdio 服务；不要先在终端单独运行 `npm run --silent mcp` 再期待 Codex 自动接管它。单独运行该命令时，它会等待 MCP 客户端握手，所以进程保持运行是正常状态；启动提示写在 stderr，stdout 留给 MCP 协议。通用客户端的配置格式见 [mcp-client.example.json](mcp-client.example.json)。

### 连接后怎么用

先运行 `npm run tauri dev` 打开编辑器，再在已重启 MCP 的 Codex 对话里直接要求，例如：

- “调用 `get_editor_state`，告诉我当前选中了哪些弹幕。”
- “先用 `list_danmakus` 查看当前选择，再把 `transform.start.x` 增加 20。”
- “把当前选择按 `/s` 条件筛选，然后调用 `center_danmakus` 水平居中。”

Codex 会按需要调用工具。`apply_field_update` 和工具栏工具默认编辑当前选择；可以先调用 `select_by_command` 修改选择范围。成功操作会返回变更、新增、选择的 ID 和警告，并作为单独的撤销步骤。

### 本机检查

运行一次性协议检查：

```bash
npm run mcp:check
```

它会启动服务进程、完成 MCP 握手、列出工具，并调用只读的 `get_editor_state`。如果编辑器没运行，会明确显示 MCP 协议正常但编辑器离线；启动 `npm run tauri dev` 后再运行即可检查本机桥接。

编辑架构统一为 editorPanel、ToolBar 和 MCP 调用 Pinia store 的 applyFieldUpdate(field, method)，再由 core/editorApi.ts 计算并一次提交。字段编辑使用字段路径；工具栏功能使用受限的命名操作字段。居中和按字分割通过 DanmakuLayer 的界面测量适配器读取文字尺寸。

服务提供状态和弹幕读取、字段更新、/s 筛选、工具栏命令、描边、居中、坐标复制/互换、镜像、旋转与长度计算、锁角、分割、撤销和重做。编辑默认作用于界面当前选择；批量修改作为一次撤销/重做操作。居中与按字分割需要编辑器界面进行文字测量。

工具输入使用 Zod 校验；无运行中的编辑器会话时，编辑器工具会返回清晰的离线错误。服务仅控制当前运行会话，不读写工程文件或媒体。

扩展工具包括：

- `create_danmakus`：传入 `danmaku` 对象/数组或 `jsonPath`，并明确提供 `relativeToCurrentTime`。`true` 使用当前播放头偏移和层级分配；`false` 保留绝对时间，只重新分配 ID。JSON 文件支持弹幕对象、数组或带 `danmakus` 数组的工程对象。
- `delete_danmakus`：传 `ids` 删除指定弹幕，省略时删除当前选择；批量 ID 有任何无效项时整批取消。
- `update_current_time` 和 `update_editor_settings`：调整播放头、画布宽高和最大层数，时间单位是毫秒。
- `save_folder_project` 和 `backup_folder_project`：保存/备份当前文件夹工程；单文件工程不支持。
- `get_editor_logs`：查询当前运行会话内存中的日志。`list_history_snapshots` 可列出快照 ID，再用 `get_history_snapshot` 按 ID 分页读取该快照中的弹幕详情。
- `create_generated_danmakus`：复用 creationTools 的生成规则，一次调用提供数量和字段规则。数字字段可以设范围、递增或循环值；颜色可以渐变、Alpha 混合或循环；文本、字体、描边、缓动支持赋值或循环。省略的字段沿用 creationTools 默认值，生成后立即创建并选中新弹幕。`relativeToCurrentTime=true` 时按当前播放头对齐。
- `get_frame`：传入 `timeMs` 获取指定时间的画面，MCP 返回图片内容供支持视觉输入的模型检查。默认最长边 1280 像素、最大 1920；调用不会移动主窗口播放头。带视频工程需要本地媒体文件。

生成规则示例：

```json
{
  "quantity": 5,
  "relativeToCurrentTime": true,
  "rules": {
    "content.text": { "mode": "assign", "value": "`第 ${i + 1} 条`" },
    "transform.start.x": { "mode": "range", "start": 0, "end": 800 },
    "content.color": { "mode": "range", "start": "#FFFFFF", "target": "#FFAA00" },
    "animation.delay": { "mode": "cycle", "values": [0, 100, 200] }
  }
}
```

Agent 可以先调用 `create_generated_danmakus`，再调用 `get_frame` 查看生成后的画面；需要调整时，继续通过字段编辑工具修改或调用 `undo_edit` 撤销。帧截图会在独立渲染窗复用视频导出的播放器 seek、WebView 截图和画布裁切逻辑，并以 JPEG 图片块返回。

stdio MCP 服务由 Codex 启动后会常驻，工具列表在进程启动时注册。修改 `src/mcp/server.ts` 后需要在 Codex 的 MCP servers 设置里重启 m7-editor 连接；Tauri 前端的 `App.vue` 和 store 变更由 `tauri dev` 的前端热更新加载。

# 使用帮助

按下`h`可唤出使用文档，在左上角图标悬停可查看快捷键，点击图标亦可唤出帮助
- 若您需要查看旧版文档，请前往：[README_1.7.0.md](public/old_doc/README_1.7.0.md)

# 项目文件结构

<details>
<summary>展开</summary>

```text
│   .gitattributes
│   .gitignore
│   index.html
│   LICENSE
│   m7_Editor.bat                             #快速启动脚本
│   mcp-client.example.json                   #MCP客户端配置示例
│   package-lock.json
│   package.json
│   README.md
│   tsconfig.json
│   tsconfig.node.json
│   vite.config.js
│
├───public
│       favicon.svg
│
├───src
│   │   App.vue
│   │   main.js
│   │   style.css
│   │
│   ├───components
│   │   ├───editor
│   │   │       creationTools.vue             #高级创建工具
│   │   │       editorPanel.vue               #编辑面板
│   │   │       PresetManager.vue             #高级创建工具预设管理器
│   │   │       TemplateManager.vue           #模板管理器
│   │   │       ToolBar.vue                   #工具栏
│   │   │
│   │   ├───notice
│   │   │       GlobalNotice.vue              #全局提醒弹窗与日志
│   │   │
│   │   ├───player
│   │   │       DanmakuLayer.vue              #弹幕渲染
│   │   │       Player.vue                    #播放器渲染
│   │   │       VideoExportRenderWindow.vue   #视频渲染窗口
│   │   │
│   │   ├───preference
│   │   │       about.vue                     #帮助/关于文档
│   │   │       projectManager.vue            #工程管理
│   │   │       TopSideBar.vue                #顶边设置栏
│   │   │       VideoExportDialog.vue         #视频导出设置弹窗
│   │   │
│   │   └───timeline
│   │           timeline.vue                  #时间轴模块
│   │
│   ├───mcp
│   │       server.ts                         #stdio MCP服务
│   │
│   ├───core
│   │   |   converter.ts                      #解析xml
│   │   |   danmaku.ts                        #弹幕数据结构
│   │   |   danmakuMeasurement.ts             #界面文字测量适配
│   │   |   editorApi.ts                      #统一编辑事务API
│   │   |   history.ts                        #快照管理
│   │   |   player.ts                         #播放器播放状态
│   │   |   project.ts                        #工程文件结构
|   |   │
|   |   └───videoExport
|   |           exportCoordinator.ts          #视频导出协调器
|   |           quality.ts                    #视频质量参数
|   |           videoEncoder.worker.ts        #编码器
│   │
│   ├───icon                                  #工具栏图标
│   │       ...
│   │
│   ├───localStorage
│   │       projectStorage.ts                 #工程文件保存/加载
│   │
│   ├───store
│   │       editor.ts                         #编辑器状态管理
│   │       notice.ts                         #日志/提醒状态管理
│   │
│   └───utils
│           danmakuGenerator.ts               #高级创建工具生成算法
│           parser.ts                         #解析工具
│           tauriBackend.ts                   #后端api
│           time.ts                           #时间格式化工具
│           toolPresets.ts                    #高级创建工具预设读写
│           validation.ts                     #验证工具
│
└───src-tauri
    │   .gitignore
    │   build.rs
    │   Cargo.lock
    │   Cargo.toml
    │   tauri.conf.json                       #构建配置
    │
    ├───capabilities
    │       default.json                      #应用权限配置
    │
    ├───icons                                 #应用图标
    │       ...
    │
    └───src                                   #后端
         lib.rs
         main.rs
```

</details>

# 联系作者

- bilibili
  - 个人主页：[jerryeee](https://space.bilibili.com/108382388)
- QQ
  - 邮箱：1968029490@qq.com
  - 弹幕art研究社：[1006093326](https://qm.qq.com/q/4T5woMsPY4)
  - 作者的小群：[710815012](https://qm.qq.com/q/3exSBilgmk)

# License

MIT License
