<div align="center">
  <h1>m7-editor<h1>

  <img src="public/favicon.svg" alt="m7-editor"  style="width: 200px; height: 200px;">
  <h3>m7-editor是一个面向 M7 / B 站特效弹幕场景的可视化编辑器</h3>

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

MCP 服务依赖如下：

- `@modelcontextprotocol/server`
- `zod`

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

# MCP 编辑器控制

MCP 服务控制当前运行的桌面编辑器会话。它通过 stdio 与 MCP 客户端通信，再经带随机令牌的本机桥连接正在运行的 Tauri 应用。需要 Node.js 22.6 或更新版本。

编辑器桥只绑定 `127.0.0.1`，端口由系统动态分配（`127.0.0.1:0`），不需要固定端口。应用把端口和随机令牌写入 Tauri 用户配置目录下的 `mcp` 子目录，独立运行的 stdio 服务从同一目录发现当前会话；系统临时目录仅作为旧版本兼容路径。Tauri 桌面应用和 MCP stdio 服务可以分别启动和退出，需在同一用户下运行。

**如果您不是开发者，请在[release](https://github.com/qmwNEbrVt2233/m7-editor/releases)下载对应版本的 MCP 服务并进行以下操作：**
1. 解压文件
2. 安装node.js
3. 在解压目录运行 `npm install`
4. 打开桌面应用并在解压目录运行协议检查，如果成功则说明您完成了将服务连接至 agent 应用的前置条件
5. agent在使用时可能遇到各种问题，建议安装[danmaku-skill](https://github.com/qmwNEbrVt2233/danmaku-skill)中的`m7-editor_MCP`skill以达到流畅使用的效果，此仓库中配套的其他skill也可按需安装

## 本机检查

运行一次性协议检查：

```bash
npm run mcp:check
```

此命令会启动服务进程、完成 MCP 握手、列出工具，并调用只读的 `get_editor_state`。如果编辑器没运行，会明确显示 MCP 协议正常但编辑器离线；启动应用程序后再运行即可检查本机桥接。如果显示编辑器服务无响应但桌面应用实为运行中可尝试再运行一次检查

扩展工具详见[server.ts](src/mcp/server.ts)或[MCP_skill](https://github.com/qmwNEbrVt2233/danmaku-skill/blob/main/m7/m7-editor-mcp/references/mcp-api.md)

## 连接 Codex

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
│   │       check.ts                          #MCP服务检查
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
