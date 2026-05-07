<template>
  <div class="toolbar">
    <div class="tool-group framed-group">
      <div class="mode-selector">
        <button 
          class="mode-btn" 
          :class="{ active: scopeMode === 'S' }" 
          @click="scopeMode = 'S'"
          title="Start: 作用于起始坐标"
        >S</button>
        <button 
          class="mode-btn" 
          :class="{ active: scopeMode === 'E' }" 
          @click="scopeMode = 'E'"
          title="End: 作用于结束坐标"
        >E</button>
        <button 
          class="mode-btn" 
          :class="{ active: scopeMode === 'B' }" 
          @click="scopeMode = 'B'"
          title="Both: 作用于起始于结束坐标"
        >B</button>
      </div>

      <div class="group-tools">
        <button class="tool-btn" title="拾取定位">
          <img src="/public/Pick_and_locate.svg" alt="拾取定位" />
        </button>
        <button class="tool-btn" title="水平居中">
          <img src="/public/horizontal_centering.svg" alt="水平居中" />
        </button>
        <button class="tool-btn" title="垂直居中">
          <img src="/public/vertical_centering.svg" alt="垂直居中" />
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <button class="tool-btn" title="将起始坐标应用至结束坐标">
      <img src="/public/S_to_E.svg" alt="起始坐标应用至结束坐标" />
    </button>
    <button class="tool-btn" title="将结束坐标应用至起始坐标">
      <img src="/public/E_to_S.svg" alt="结束坐标应用至起始坐标" />
    </button>
    
    <div class="divider"></div>

    <button class="tool-btn" title="行分隔">
      <img src="/public/Split_by_line.svg" alt="行分隔" />
    </button>
    <button class="tool-btn" title="时间分割">
      <img src="/public/cut.svg" alt="时间分割" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 记录组合工具的作用范围，默认为 'B'
const scopeMode = ref<'S' | 'E' | 'B'>('B')

// TODO: 后续将在这里引入 useEditorStore 及弹幕操作逻辑
</script>

<style scoped>
/* 贴靠 EditorPanel 的整体工具栏样式 */
.toolbar {
  width: 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background-color: #1e1e1e; 
  width: max-content;
  box-sizing: border-box;
}

/* 按钮通用样式 */
.tool-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background-color: #333;
  border-color: #444;
}

.tool-btn img {
  width: 30px;
  height: 30px;
}

/* 分组框的特殊样式 */
.framed-group {
  display: flex;
  flex-direction: row;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 4px;
  background-color: #252525;
  gap: 4px;
  margin-top: 10px
}

/* 左侧模式选择器竖向排列 */
.mode-selector {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-right: 1px solid #333;
  padding-right: 4px;
}

/* S/E/B 按钮样式 */
.mode-btn {
  background: transparent;
  border: 1px solid transparent;
  color: #888;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.mode-btn:hover {
  color: #ddd;
}

.mode-btn.active {
  background-color: #4CAF50; /* 活跃状态可根据编辑器主色调调整 */
  color: #fff;
  border-color: #4CAF50;
}

/* 右侧工具组竖向排列 */
.group-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 视觉分隔线 */
.divider {
  width: 80%;
  height: 1px;
  background-color: #333;
  margin: 4px 0;
}
</style>