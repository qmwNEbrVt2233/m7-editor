<template>
  <div v-if="help.isVisible" class="help-modal-mask" @click.self="help.hide()">
    <div class="help-modal-container">
      <!-- 关闭按钮 -->
      <button class="help-close-btn" @click="help.hide()" title="关闭">✕</button>

      <!-- 左侧导航 -->
      <div class="help-sidebar">
        <div class="help-sidebar-title">使用文档</div>
        <div class="help-sidebar-option help-scrollbar">
          <template v-for="section in docSections" :key="section.id">
            <!-- 有子节点的分类 -->
            <template v-if="section.children">
              <div
                class="help-nav-category"
                :class="{ active: help.activeSection === section.id }"
                @click="help.handleSectionClick(section.id)"
              >
                {{ section.title }}
              </div>
              <template v-for="child in section.children" :key="child.id">
                <template v-if="child.children">
                  <div
                    class="help-nav-subcategory"
                    :class="{ active: help.activeSection === child.id }"
                    @click="help.handleSectionClick(child.id)"
                  >
                    {{ child.title }}
                  </div>
                  <div
                    v-for="sub in child.children"
                    :key="sub.id"
                    class="help-nav-item"
                    :class="{ active: help.activeSection === sub.id }"
                    @click="help.handleSectionClick(sub.id)"
                  >
                    {{ sub.title }}
                  </div>
                </template>
                <div
                  v-else
                  class="help-nav-item"
                  :class="{ active: help.activeSection === child.id }"
                  @click="help.handleSectionClick(child.id)"
                >
                  {{ child.title }}
                </div>
              </template>
            </template>
            <!-- 无子节点的顶级项 -->
            <div
              v-else
              class="help-nav-category"
              :class="{ active: help.activeSection === section.id }"
              @click="help.handleSectionClick(section.id)"
            >
              {{ section.title }}
            </div>
          </template>
        </div>
      </div>

      <!-- 右侧内容 -->
      <div class="help-content-wrapper">
        <div class="help-content-header">{{ currentTitle }}</div>
        <div class="help-content help-scrollbar" v-html="currentBody"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useHelpStore, docSections } from '@/store/help'

const help = useHelpStore()

const sectionContents: Record<string, string> = {
  'about': `
    <subtitle>关于</subtitle>
    <img src="/favicon.svg" alt="m7-editor" style="width: 150px; height: 150px;">
    <p>m7-editor是一个面向 M7 / B 站特效弹幕场景的可视化编辑器，由jerryeee开发<p>
    <p>您所在的版本：<kbd>1.8.0</kbd></p>
    <p>反馈渠道:<p>
    <ul>
      <li><a href="https://github.com/qmwNEbrVt2233/m7-editor/issues" target="_blank">github issues</a></li>
      <li><a href="https://space.bilibili.com/108382388" target="_blank">bilibili profile</a></li>
      <li>邮箱：1968029490@qq.com</li>
    </ul>
    <p>下载 / 更新 应用请前往：<a href="https://github.com/qmwNEbrVt2233/m7-editor/releases" target="_blank">qmwNEbrVt2233/m7-editor/releases</a></p>
    <p>开源地址：<a href="https://github.com/qmwNEbrVt2233/m7-editor" target="_blank">qmwNEbrVt2233/m7-editor</a></p>
  `,

  'interface-file': `
    <subtitle>文件</subtitle>
    <p>顶边栏区域的文件菜单提供以下功能：</p>
    <ul>
      <li><strong>导入媒体</strong></li>
      <li><strong>播放 / 暂停</strong></li>
      <li><strong>导出工程 JSON</strong></li>
      <li><strong>导入工程 JSON</strong></li>
      <li><strong>导出 XML</strong></li>
      <li><strong>导入 XML</strong></li>
      <li><strong>保存缓存</strong></li>
      <li><strong>加载缓存</strong></li>
      <li><strong>清空缓存工程</strong></li>
    </ul>
    <h3>功能详解</h3>
    <p>1. 导入媒体 - 可选择常见的视频&音频格式文件</p>
    <p>2. 播放 / 暂停 - 空格切换，在录屏模式下不可用</p>
    <p>3. 导出工程（Ctrl + S） - 大部分所选设置将保留</p>
    <p>4. 导入工程 - 导入json工程，自动应用工程中的设置，并清空快照历史，向下兼容所有版本</p>
    <p>5. 导出 XML - 根据导出配置导出XML格式弹幕文件</p>
    <p>6. 保存缓存（Ctrl + D） - 将工程缓存到浏览器 localStorage</p>
    <p>7. 加载缓存 - 从缓存加载工程，初始化时若有缓存工程则自动加载</p>
    <p>8. 清空缓存工程（Ctrl + Del）</p>
  `,

  'interface-config': `
    <subtitle>配置</subtitle>
    <table class="help-table">
      <thead><tr><th>功能</th><th>默认值</th></tr></thead>
      <tbody>
        <tr><td>配置播放头移动步长</td><td>16.666667（/60）</td></tr>
        <tr><td>配置新建弹幕的默认生存时间</td><td>1000</td></tr>
        <tr><td>maxLayer 最大层数</td><td>100</td></tr>
      </tbody>
    </table>
    <h3>功能详解</h3>
    <p>配置播放头移动步长</p>
    <ul><li>此选项用于定义单独按下左右方向键时播放头移动距离（ms），使用<code>/帧数</code>快速以帧数设置</li></ul>
    <p>配置新建弹幕的默认生存时间</p>
    <ul><li>设置使用<code>;</code>创建弹幕时的默认生存时间，可使用<code>*倍率</code>设置相对移动步长的倍率</li></ul>
    <p>maxLayer 最大层数</p>
    <ul><li>设置轨道数量，此选项影响自动分配层级的上限</li></ul>
  `,

  'interface-player': `
    <subtitle>播放器</subtitle>
    <table class="help-table">
      <thead><tr><th>功能</th><th>默认值</th></tr></thead>
      <tbody>
        <tr><td>Screen Width</td><td>800</td></tr>
        <tr><td>Screen Height</td><td>450</td></tr>
        <tr><td>缩放</td><td>自动分配（百分比）</td></tr>
        <tr><td>激进优化</td><td>不勾选</td></tr>
      </tbody>
    </table>
    <h3>功能详解</h3>
    <p>播放器宽高：单位像素</p>
    <p>播放器缩放：单位百分比</p>
    <p>激进优化</p>
    <ul><li>开启后弹幕渲染效率大幅提升，但在高密度区开始播放可能由于缓存来不及计算导致暂时卡顿</li></ul>
  `,

  'interface-preprocess': `
    <subtitle>预处理</subtitle>
    <table class="help-table">
      <thead><tr><th>功能</th><th>默认值</th></tr></thead>
      <tbody>
        <tr><td>允许负值</td><td>不勾选</td></tr>
        <tr><td>XML 按比例导出</td><td>不勾选</td></tr>
        <tr><td>对导入 XML 进行 -50ms 处理</td><td>勾选</td></tr>
        <tr><td>对导出 XML 进行 +50ms 处理</td><td>勾选</td></tr>
      </tbody>
    </table>
    <h3>功能详解</h3>
    <p>允许负值</p>
    <ul><li>勾选后所有因负值导致的钳制都不会发生</li></ul>
    <p>XML 按比例导出</p>
    <ul><li>勾选后坐标参数在导出时自动根据设置的播放器宽高计算为百分比定位格式</li></ul>
    <p>对导入 XML 进行 -50ms 处理</p>
    <ul><li>勾选后在导入 XML 弹幕文件时将生存时间 -50ms</li></ul>
    <p>对导出 XML 进行 +50ms 处理</p>
    <ul><li>勾选后在导出 XML 弹幕文件时将生存时间 +50ms</li></ul>
  `,

  'interface-assistant': `
    <subtitle>辅助</subtitle>
    <table class="help-table">
      <thead><tr><th>功能</th><th>默认值</th></tr></thead>
      <tbody>
        <tr><td>使用弹幕颜色渲染弹幕块</td><td>不勾选</td></tr>
        <tr><td>显示频谱图</td><td>不勾选</td></tr>
        <tr><td>频谱图上色选项</td><td>默认彩色</td></tr>
        <tr><td>自定义颜色（在上色选项为自定义时显示）</td><td>#00bbff</td></tr>
      </tbody>
    </table>
    <h3>功能详解</h3>
    <p>使用弹幕颜色渲染弹幕块</p>
    <ul><li>勾选后时间轴中的弹幕块颜色渲染为弹幕实际颜色</li></ul>
    <p>显示频谱图</p>
    <ul><li>勾选后在时间轴中渲染音频频谱图，使用此项需已有导入的媒体文件</li></ul>
    <p>频谱图上色选项</p>
    <ul><li>此处提供两个选项，<code>默认彩色</code>与<code>自定义</code><br/>在选择“自定义”时会额外显示自定义颜色输入框</li></ul>
  `,

  'interface-editor': `
    <subtitle>编辑面板</subtitle>
    <p>选中一条或多条弹幕后，可以直接编辑以下属性：</p>
    <ul>
      <li><strong>Layer</strong> - 弹幕所在层级</li>
      <li><strong>开始时间</strong> - 弹幕出现的时间点</li>
      <li><strong>文本内容</strong> - 弹幕显示的文字</li>
      <li><strong>字体</strong> - 弹幕使用的字体</li>
      <li><strong>字号</strong> - 弹幕字体大小</li>
      <li><strong>颜色</strong> - 弹幕颜色</li>
      <li><strong>描边</strong> - 弹幕描边设置</li>
      <li><strong>起点 / 终点坐标</strong> - 弹幕移动路径</li>
      <li><strong>Z 轴 / Y 轴旋转</strong> - 弹幕旋转角度</li>
      <li><strong>起止透明度</strong> - 弹幕淡入淡出效果</li>
      <li><strong>生存时间</strong> - 弹幕显示总时长</li>
      <li><strong>运动时间</strong> - 弹幕移动动画时长</li>
      <li><strong>延迟</strong> - 弹幕出现延迟</li>
      <li><strong>缓动方式</strong> - 动画缓动函数</li>
    </ul>

    <h3>数值表达式支持</h3>
    <p>所有<strong>数值</strong>输入框均支持直接输入运算表达式且支持批量操作：</p>
    <p><strong>直接赋值：</strong><code>1000</code></p>
    <p><strong>四则运算：</strong><code>+100</code>、<code>-50</code>、<code>*2</code>、<code>/2</code></p>
    <p><strong>随机赋值范围：</strong><code>r+50</code>、<code>r-30</code>、<code>r100</code></p>

    <h3>颜色字段</h3>
    <ul>
      <li>普通十六进制颜色：<code>#FFFFFF</code></li>
      <li>不带 # 的颜色：<code>FFFFFF</code></li>
      <li>Alpha 混合格式：<code>目标颜色@ALPHA值 -> 例：FFFFFF@0.5</code></li>
    </ul>
  `,

  'interface-tools-list': `
    <subtitle>一般工具</subtitle>
    <p>选中弹幕后可点击工具栏中的图标快捷操作，所有功能均支持批量操作。</p>

    <h3>拾取定位工具</h3>
    <ul>
      <li>点击工具图标后可在屏幕中单击任意位置将坐标应用</li>
      <li>点击其他位置视为放弃</li>
      <li>支持选择作用范围</li>
    </ul>

    <h3>垂直/水平 居中工具</h3>
    <ul>
      <li>支持 Z 轴旋转</li>
      <li><strong>不支持 Y 轴翻转</strong>，若有 Y 轴翻转会导致偏移，不建议使用</li>
      <li>支持选择作用范围</li>
      <li>若弹幕坐标经处理后小于 0 则弹窗提醒并钳至 0（勾选"允许负值"则不执行此操作）</li>
    </ul>

    <h3>SEB 模式</h3>
    <p>拾取定位工具、水平居中工具、垂直居中工具提供三个模式选项：</p>
    <ul>
      <li><strong>S（Start）</strong>：作用于起始坐标</li>
      <li><strong>E（End）</strong>：作用于结束坐标</li>
      <li><strong>B（Both）</strong>：作用于起始与结束坐标（默认）</li>
    </ul>

    <h3>垂直/水平 镜像工具</h3>
    <ul>
      <li>若弹幕坐标经处理后小于 0 则弹窗提醒并钳至 0（勾选"允许负值"则不执行此操作）</li>
    </ul>

    <h3>坐标转换工具</h3>
    <ul>
      <li><strong>将起始坐标应用至结束坐标</strong></li>
      <li><strong>将结束坐标应用至起始坐标</strong></li>
      <li><strong>互换结束与起始坐标</strong></li>
    </ul>

    <h3>Z 轴旋转计算工具</h3>
    <p>通过起始/结束坐标计算 Z 轴旋转角度，使旋转角度与运动方向一致</p>

    <h3>行分隔工具</h3>
    <ul>
      <li>将有换行的弹幕拆分为多条弹幕</li>
      <li>自动进行 Layer 避让</li>
      <li>支持 Z 轴旋转，<strong>不支持 Y 轴翻转</strong>，若有 Y 轴翻转会导致偏移，不建议使用</li>
    </ul>

    <h3>字分隔工具</h3>
    <ul>
      <li>拆分为单个字符</li>
      <li>自动进行 Layer 避让</li>
      <li>支持 Z 轴旋转，<strong>不支持 Y 轴翻转</strong>，若有 Y 轴翻转会导致偏移，不建议使用</li>
    </ul>

    <h3>时间分割工具</h3>
    <p>以当前播放时间分割选中弹幕。</p>
  `,

  'interface-advanced-tools': `
    <subtitle>高级工具</subtitle>

    <h3 style="margin-top: 0;">描边工具</h3>
    <ul>
      <li>在选中弹幕周围 8 个方向生成 8 条弹幕</li>
      <li>可选择描边宽度（单位：像素）</li>
      <li>可设置描边颜色</li>
      <li>自动进行 Layer 避让</li>
      <li>若新建弹幕坐标有小于 0 的则弹窗提醒并钳至 0（勾选"允许负值"则不执行此操作）</li>
    </ul>

    <h3>计算工具</h3>
    <p><strong>目标角度解析：</strong></p>
    <ol>
      <li>留空则使用选中弹幕自身的 ZRotate 参数作为目标角度</li>
      <li>输入<code>+/-数字</code>则以弹幕自身 ZRotate 值 +/- 数值计算相对目标角度</li>
      <li>仅输入数字则直接以输入值作为目标角度</li>
    </ol>
    <p><strong>长度应用工具：</strong>通过起始坐标、输入的长度以及设置的目标角度计算结束坐标，需点击"应用"应用更改。</p>
    <p><strong>锁定角度功能：</strong>勾选后在修改结束坐标 X/Y 时会根据设置的目标角度计算另一个 X/Y 坐标，结果钳至 0~10000，支持批量操作。</p>

    <h3>命令工具</h3>
    <p><strong>可用于计算与筛选的字段：</strong></p>
    <p>layer、startTime、size、startX、startY、endX、endY、zRotate、yRotate、opacityFrom、opacityTo、duration、moveDuration、delay</p>
    <p><strong>仅筛选时可用的字段：</strong></p>
    <p>id、text、font、color、stroke、easing</p>

    <p><strong>赋值计算命令：</strong></p>
    <ul>
      <li>格式：<code>被赋值字段名 = 赋值计算式</code>（支持四则运算、其他字段作为变量）</li>
      <li>支持用 <code>;</code> 分隔设置多个赋值规则</li>
      <li>特殊赋值规则 upset：<code>字段名 = upset</code>，在选中弹幕范围内打乱所选字段，此方法单独定义，不可插入计算式</li>
    </ul>

    <p><strong>选择筛选命令：</strong></p>
    <ul>
      <li>命令类型声明 <code>/s</code></li>
      <li>规则列表（或）使用 <code>;</code> 分隔，筛选规则（与）使用 <code>,</code> 分隔</li>
      <li>单个筛选规则格式：<code>筛选字段名:"规则"</code></li>
      <ul>
        <li>数值范围：<code>"数值~数值"</code></li>
        <li>正则表达式：<code>"&lt;^Hello.*$&gt;"</code></li>
        <li>严格匹配：<code>"'匹配值'"</code></li>
      </ul>
    </ul>
    <ul><li><strong>例：</strong><kbd>/s startTime:"1000~56000,'300'",text:"<^sample>";size:"'127'"</kbd></ul></li>
  `,

  'interface-timeline': `
    <subtitle>时间轴区域</subtitle>
    <ul>
      <li>显示多层轨道（层数可自定，默认 100 层）</li>
      <li>可拖动播放头</li>
      <li>可拖动弹幕块位置</li>
      <li>可拉伸弹幕块左右边界以修改时间范围</li>
      <li>支持 <kbd>Ctrl</kbd> 框选与多选</li>
      <li>支持时间轴缩放</li>
      <li>支持播放头与视图快速平移</li>
      <li>支持顶部拖拽调整时间轴区域高度</li>
      <li>支持在拖动弹幕时快捷移动视图</li>
      <li>使用 <kbd>O</kbd> 键调整轨道透明度</li>
      <li>按下 <kbd>P</kbd> 键时隐藏轨道</li>
    </ul>
  `,

  'interface-creation-data': `
    <subtitle>预备弹幕数据区</subtitle>
    <ul>
      <li>提供可直接编辑的 JSON 预览框</li>
      <li>支持格式化 JSON</li>
      <li>支持重置为单条弹幕模板</li>
      <li>点击"创建"后才会真正写入弹幕列表</li>
      <li>写入时会自动完成字段规范化、新 ID 分配，并记录历史快照</li>
    </ul>
  `,

  'interface-creation-panel': `
    <subtitle>工具面板</subtitle>
    <ul>
      <li>支持设置生成数量</li>
      <li>数量输入框前提供"表达式"复选框，默认关闭</li>
      <li>支持"替换"和"添加"两种写入预览框的方式</li>
      <li>所有数值字段都支持三种生成模式：
        <ul>
          <li><strong>循环</strong>：按输入列表循环取值，支持表达式</li>
          <li><strong>范围</strong>：指定第一条和最后一条弹幕的值，中间值线性均分或由表达式控制插值</li>
          <li><strong>相对</strong>：指定起始值和每次偏移值，后续弹幕递推生成</li>
        </ul>
      </li>
      <li>开启"表达式"且数值字段处于"范围"模式时，会额外显示该字段专属的表达式输入区</li>
      <li>颜色字段支持三种模式：循环、范围（Alpha 混合）、相对（Alpha 递增混合）</li>
      <li>text、font、stroke、easing 支持"赋值"和"循环"两种模式</li>
      <li>text 文本字段支持 JS 字符串拼接格式：<code>\`当前：\${round(t * 100)}%\`</code> → 输出例：<code>当前：25%</code></li>
      <li>循环列表统一使用 <code>;</code> 加换行分隔</li>
      <li>点击"写入"后先生成 JSON 到预览框，确认无误后再点击"创建"</li>
    </ul>
  `,

  'interface-creation-presets': `
    <subtitle>预设管理器</subtitle>
    <p>高级创建工具右侧带有独立的预设管理侧边栏，用于保存、导入、导出和管理整套工具面板配置：</p>
    <ul>
      <li><strong>导入预设</strong>：将 .prs 文件中的预设追加到当前列表</li>
      <li><strong>导出预设</strong>：将当前列表中的全部预设导出为 .prs 格式（实质为 JSON）</li>
      <li><strong>添加预设</strong>：将当前工具面板配置保存为新预设，默认命名为"新建预设1"、"新建预设2"依次递增</li>
      <li><strong>预设列表</strong>：点击即把该预设应用到当前工具面板</li>
      <li><strong>预设管理</strong>：拥有独立的管理选中状态，单击选中用于管理，再次点击进入重命名，按 Delete 删除当前选中的预设</li>
    </ul>
    <p>预设内容仅保存工具面板状态，不会保存预览框里的 JSON。预设列表会自动同步到浏览器 localStorage，也可通过导入/导出在不同工程环境中迁移。</p>
  `,

  'interface-creation-expressions': `
    <subtitle>表达式规范</subtitle>

    <h3>可用变量</h3>
    <ul>
      <li><code>S</code>：起始值</li>
      <li><code>E</code>：结束值</li>
      <li><code>t</code>：归一化进度，范围 0 ~ 1</li>
      <li><code>i</code>：当前索引，从 0 开始</li>
      <li><code>n</code>：生成数量</li>
      <li><code>pi</code>：圆周率</li>
      <li><code>e</code>：自然常数</li>
      <li><code>width</code>：设置的屏幕宽度</li>
      <li><code>height</code>：设置的屏幕高度</li>
      <li>所有数值字段当前索引的值（如 <code>transform.start.x</code>）</li>
    </ul>

    <h3>可用运算与函数</h3>
    <ul>
      <li>基础运算：<code>+ - * / ^ () %</code></li>
      <li>常用函数：<code>random sin cos tan abs sqrt min max floor ceil round log exp</code></li>
      <li>特殊函数：<code>bezier(x1, y1, x2, y2, t)</code> - 三阶贝塞尔曲线缓动进度</li>
    </ul>

    <h3>内置表达式预设</h3>
    <ul>
      <li>线性均分：<code>S + (E - S) * t</code></li>
      <li>Ease In Out：<code>S + (E - S) * bezier(0.42, 0, 0.58, 1, t)</code></li>
      <li>Ease In：<code>S + (E - S) * bezier(0.42, 0, 1, 1, t)</code></li>
      <li>Ease Out：<code>S + (E - S) * bezier(0, 0, 0.58, 1, t)</code></li>
      <li>二次加速曲线：<code>S + (E - S) * t ^ 2</code></li>
      <li>二次减速曲线：<code>S + (E - S) * (1 - (1 - t) ^ 2)</code></li>
      <li>随机：<code>S + (E - S) * random()</code></li>
      <li>轻微回弹：<code>S + (E - S) * (t + 0.18 * sin(pi * t) * (1 - t))</code></li>
    </ul>
  `,

  'import-export-json': `
    <subtitle>工程 JSON</subtitle>
    <p>用于保存编辑器工程状态，包含：</p>
    <ul>
      <li>项目元数据</li>
      <li>媒体文件信息</li>
      <li>时间轴信息</li>
      <li>播放器与导出设置</li>
      <li>全部弹幕数据</li>
    </ul>
    <p>适合在本项目内继续编辑、备份或分享工程。</p>
  `,

  'import-export-xml': `
    <subtitle>XML 弹幕文件</subtitle>
    <p>用于和 B 站 XML 弹幕格式进行互通。当前实现特性：</p>
    <ul>
      <li>导出时会按 startTime → layer 排序</li>
      <li>同一 startTime 下会使用 fake sendTime 保证导出顺序</li>
      <li>Microsoft YaHei 会做特殊格式处理</li>
      <li>可按当前 screen width/height 将像素坐标导出为比例坐标</li>
      <li>导入时会根据 XML 中的 date/sendTime 反推 layer 顺序</li>
      <li>导入时若坐标位于 0 ≤ value &lt; 1，会按当前 screen width/height 视为比例坐标并转成像素</li>
      <li>导入时会额外执行时间冲突避让，避免大量弹幕挤在同一 layer</li>
      <li>单条 XML 弹幕解析失败时会跳过该条并继续导入其他弹幕</li>
      <li>导出时若颜色值为 0 则修正至 1，保证在 B 站不会显示错误</li>
      <li>导出时若选择按比例并检测到有弹幕坐标超出显示范围，则强制修改为 0.999 并弹窗提示</li>
    </ul>
  `,

  'import-export-paste': `
    <subtitle>粘贴弹幕</subtitle>
    <p>当前粘贴功能支持比早期版本更宽松的输入格式：</p>
    <ul>
      <li>直接复制的弹幕数组</li>
      <li>整个 project.json（自动提取 danmakus）</li>
      <li>单条弹幕对象</li>
      <li>从 danmakus 数组中截取的若干对象片段</li>
      <li>带尾逗号的 JSON 片段</li>
    </ul>
    <p>粘贴后会自动执行：</p>
    <ul>
      <li>新 ID 分配</li>
      <li>播放头对齐的时间偏移</li>
      <li>Layer 冲突避让</li>
    </ul>
  `,

  'suggestions': `
    <subtitle>推荐的基本工作流</subtitle>
    <ol>
      <li>在上方配置所需屏幕宽高、最大 Layer 层数、XML 预处理等</li>
      <li>导入所需资源（工程文件、XML 弹幕文件、媒体）。若上次使用了 <kbd>Ctrl + D</kbd> 记录工程缓存则可跳过导入工程（网页版需重新选择媒体文件）</li>
      <li>使用提供的任何编辑手段开始弹幕编辑与创建</li>
      <li>使用 <kbd>Ctrl + S</kbd> 保存至本地或选择 <kbd>Ctrl + D</kbd> 以便下次快速进入工作</li>
      <li>完成后选择你需要的预处理选项并导出 XML</li>
      <li>使用 <a href="https://github.com/qmwNEbrVt2233/DMsender_CLI/releases" target="_blank">DMsender_CLI</a> 或 <a href="https://github.com/MikuFan039/DMSenderAPP/releases" target="_blank">弹幕发射场</a> 或其他 XML 发送工具将弹幕上传至 Bilibili</li>
      <li>想要录屏分享？打开录屏模式（<kbd>Ctrl + Alt + Space</kbd>）自动全屏，完成后按 <kbd>ESC</kbd> 回到编辑模式</li>
    </ol>
  `,

  'notes': `
    <subtitle>当前注意事项</subtitle>
    <ul>
      <li>若使用网页版，刷新页面后需重新选择媒体文件</li>
      <li>若使用网页版，本地缓存工程依赖浏览器 localStorage，清空网站数据后会丢失缓存的工程</li>
      <li>XML 导入可能出现问题，请不要高估解析工具</li>
      <li>若发现高密度场景下渲染卡顿，请开启"激进优化"</li>
      <li>XML 比例坐标导入导出依赖当前播放器设置中的 screen width/height，<strong>若要使用请提前修改宽高！否则转为像素坐标时会与预期不符！</strong></li>
      <li>弹幕渲染优化采用低频确定高刷范围，若发现弹幕层级显示不正常或无法显示，请按下 <kbd>Shift + Tab</kbd> 手动重构缓存池</li>
      <li>若发现修改弹幕结束坐标时不起效用，请检查"运动耗时"设置，这可能是因为其设置为 0 导致的</li>
      <li>若遇到问题可选择导出日志以排查</li>
    </ul>
  `,

  'license': `
    <subtitle>开源协议</subtitle>
    <kbd style="display: block; max-width: 550px;">Copyright (c) 2026 qmwNEbrVt2233

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.</kbd>
  `
}

const currentContent = computed(() => {
  return sectionContents[help.activeSection] || sectionContents['about']
})

const currentTitle = computed(() => {
  const match = currentContent.value.match(/<subtitle>(.*?)<\/subtitle>/)
  return match ? match[1] : ''
})

const currentBody = computed(() => {
  return currentContent.value.replace(/<subtitle>.*?<\/subtitle>/, '')
})
</script>

<style scoped>
.help-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.help-modal-container {
  background: rgb(69, 69, 69);
  border-radius: 10px;
  border: 1px solid #333;
  width: 75%;
  max-width: 1100px;
  height: 80vh;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  position: relative;
  overflow: hidden;
}

.help-close-btn {
  position: absolute;
  top: 10px;
  right: 14px;
  background: #454545;
  border: none;
  color: #aaa;
  font-size: 20px;
  cursor: pointer;
  z-index: 10;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}

.help-close-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

/* ── 左侧导航 ── */
.help-sidebar {
  width: 220px;
  min-width: 220px;
  background: rgb(58, 58, 58);
  border-right: 1px solid #444;
  flex-shrink: 0;
}

.help-sidebar-title {
  padding: 12px 14px;
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
  border-bottom: 1px solid #444;
}

.help-sidebar-option {
  overflow-y: auto;
  height: calc(80vh - 45px);
}

/* 一级分类 */
.help-nav-category {
  padding: 8px 23px;
  cursor: pointer;
  color: #bbb;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.12s, color 0.12s;
  user-select: none;
  border-left: 3px solid transparent;
}

.help-nav-category:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e0e0e0;
}

.help-nav-category.active {
  background: rgba(150, 150, 150, 0.12);
  color: #ccc;
}

/* 二级分类 */
.help-nav-subcategory {
  padding: 7px 14px 7px 33px;
  cursor: pointer;
  color: #aaa;
  font-size: 12.5px;
  font-weight: 500;
  transition: background 0.12s, color 0.12s;
  user-select: none;
  border-left: 3px solid transparent;
}

.help-nav-subcategory:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #d0d0d0;
}

.help-nav-item.active {
  background: rgba(150, 150, 150, 0.12);
  color: #ccc;
}

/* 叶子节点 */
.help-nav-item {
  padding: 6px 14px 6px 43px;
  cursor: pointer;
  color: #999;
  font-size: 13px;
  transition: background 0.12s, color 0.12s;
  user-select: none;
  border-left: 3px solid transparent;
}

.help-nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #ccc;
}

.help-nav-item.active {
  background: rgba(150, 150, 150, 0.12);
}

/* ── 右侧内容 ── */
.help-content-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.help-content-header {
  flex-shrink: 0;
  padding: 16px 32px 17px;
  font-size: 24px;
  font-weight: 600;
  color: #e8e8e8;
  border-bottom: 1px solid #555;
  background: rgb(69, 69, 69);
}

.help-content {
  flex: 1;
  padding: 18px 32px 28px;
  overflow-y: auto;
  color: #d0d0d0;
  line-height: 1.7;
  font-size: 14px;
}

.help-content :deep(h2) {
  color: #e8e8e8;
  font-size: 20px;
  margin: 0 0 16px;
}

.help-content :deep(h3) {
  color: #ddd;
  font-size: 17px;
  margin: 22px 0 10px;
}

.help-content :deep(p) {
  margin: 0 0 10px;
}

.help-content :deep(ul),
.help-content :deep(ol) {
  margin: 6px 0 14px;
  padding-left: 22px;
}

.help-content :deep(li) {
  margin-bottom: 4px;
}

.help-content :deep(strong) {
  color: #e8e8e8;
}

.help-content :deep(code) {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  white-space: pre-wrap;
}

.help-content :deep(kbd) {
  background: #555;
  border: 1px solid #666;
  border-radius: 3px;
  padding: 1px 5px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: #ddd;
  box-shadow: 0 1px 0 #444;
  white-space: pre-wrap;
}

.help-content :deep(a) {
  color: #64b5f6;
  text-decoration: none;
}

.help-content :deep(a:hover) {
  text-decoration: underline;
}

/* ── 表格 ── */
.help-content :deep(.help-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 18px;
  font-size: 13px;
}

.help-content :deep(.help-table th) {
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  font-weight: 600;
  padding: 8px 12px;
  text-align: left;
  border-bottom: 2px solid #555;
  border-radius: 4px 4px 0 0;
}

.help-content :deep(.help-table td) {
  padding: 7px 12px;
  border-bottom: 1px solid #4a4a4a;
  color: #bbb;
}

.help-content :deep(.help-table tr:hover td) {
  background: rgba(255, 255, 255, 0.03);
}

.help-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.help-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.help-scrollbar::-webkit-scrollbar-thumb {
  background: #676767;
  border-radius: 4px;
}

.help-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #7c7c7c;
}
</style>
