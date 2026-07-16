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
- 目前`应用`支持 windows 与 mac 系统

# 技术栈
[![Vue](https://img.shields.io/badge/-Vue-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/-Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Pinia](https://img.shields.io/badge/-Pinia-FFDD5F?style=flat-square&logo=vitest&logoColor=black)](https://pinia.vuejs.org/)
[![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
<a href="https://mathjs.org/"><img src="https://mathjs.org/css/img/mathjs.svg" style="width: 66px; height: 20px"></a>
<a href="https://wavesurfer.xyz/"><img src="https://wavesurfer.xyz/logo-small.png" style="width: 20px; height: 20px"></a>
<a href="https://v2.tauri.app/"><img src="https://v2.tauri.app/_astro/logo.BQPqkdSq.svg" style="width: 66px; height: 20px"></a>
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
- `wavesurfer.js`
- `terser`
- `tauri`
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
│   m7_Editor.bat                    #快速启动脚本
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
│   │   │       creationTools.vue    #高级创建工具
│   │   │       PresetManager.vue    #高级创建工具预设管理器
│   │   │       editorPanel.vue      #编辑面板
│   │   │       ToolBar.vue          #工具栏
│   │   │
│   │   ├───notice
│   │   │       GlobalNotice.vue     #全局提醒弹窗与日志
│   │   │
│   │   ├───player
│   │   │       DanmakuLayer.vue     #弹幕渲染
│   │   │       Player.vue           #播放器渲染
│   │   │
│   │   ├───preference
│   │   │       about.vue            #帮助/关于文档
│   │   │       projectManager.vue   #工程管理
│   │   │       TopSideBar.vue       #顶边设置栏
│   │   │
│   │   └───timeline
│   │           timeline.vue         #时间轴模块
│   │
│   ├───core
│   │       converter.ts             #解析xml
│   │       danmaku.ts               #弹幕数据结构
│   │       history.ts               #快照管理
│   │       player.ts                #播放器播放状态
│   │       project.ts               #工程文件结构
│   │
│   ├───icon                         #工具栏图标
│   │       ...
│   │
│   ├───localStorage
│   │       projectStorage.ts        #工程文件保存/加载
│   │
│   ├───store
│   │       editor.ts                #Pinia 状态管理
│   │       notice.ts                #日志/提醒状态管理
│   │
│   └───utils
│           danmakuGenerator.ts      #高级创建工具生成算法
│           parser.ts                #解析工具
│           tauriBackend.ts          #后端api
│           time.ts                  #时间格式化工具
│           toolPresets.ts           #高级创建工具预设读写
│           validation.ts            #验证工具
│
└───src-tauri
    │   .gitignore
    │   build.rs
    │   Cargo.lock
    │   Cargo.toml
    │   tauri.conf.json              #构建配置
    │
    ├───capabilities
    │       default.json             #应用权限配置
    │
    ├───icons                        #应用图标
    │       ...
    │
    └───src                          #后端
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
