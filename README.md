<div align="center">
  <h1>m7-editor<h1>

  <img src="public/favicon.svg" alt="m7-editor"  style="width: 200px; height: 200px;">
  <h3>m7-editor是一个面向 M7 / B 站特效弹幕场景的可视化编辑器</h3>
  <h3>提供音视频预览、时间轴排布、批量属性编辑、工程保存，以及 XML 导入导出能力</h3>

</div>

# 如何使用

- 现提供一键安装使用选择，请从[release](https://github.com/qmwNEbrVt2233/m7-editor/releases)获取最新版本
- 安装包解压后应用程序大小约10mb
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

# 当前注意事项

- 若使用网页版，刷新页面后需重新选择媒体文件
- 若使用网页版，本地缓存工程依赖浏览器 `localStorage`，清空网站数据后会丢失缓存的工程
- XML 导入可能出现问题，请不要高估解析工具
- 若发现高密度场景下渲染卡顿，请开启`激进优化`
- XML 比例坐标导入导出依赖当前播放器设置中的 `screen width/height` **若要使用请提前修改宽高！否则转为坐标时会与预期不符！**
- 弹幕渲染优化采用低频确定高刷范围，若发现弹幕层级显示不正常或无法显示，请按下`Shift + Tab`手动重构缓存池
- 若您发现修改弹幕结束坐标时不起效用，请检查您的`运动耗时`设置，这可能是因为其设置为0导致的
- 若遇到问题可选择导出日志以排查

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
│           tauriMedia.ts            #媒体文件路径
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
    │       default.json
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
