<template>
  <div class="log">{{ store.logMessage }}</div>
  <Transition name="fade">
    <div v-if="store.isVisible" class="custom-modal-mask">
      <div class="custom-modal-container" :class="store.type">
        <div class="modal-header">
          <h3>{{ store.title }}</h3>
        </div>
        <div class="modal-body">
          <p>{{ store.popMessage }}</p>
        </div>
        <div class="modal-footer">
          <button v-if="store.isConfirm" class="btn-cancel" @click="store.handleAction(false)">取消</button>
          <button class="btn-confirm" @click="store.handleAction(true)">确定</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useNoticeStore } from '../../store/notice'
const store = useNoticeStore()
</script>

<style scoped>
.log {
  position: fixed;
  background: #333;
  border-radius: 0 5px 0 0;
  border: 1px solid #444;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.4);
  padding: 5px;
  left: 0;
  bottom: 0;
  font-size: 10px;
  z-index: 9998;
}

.custom-modal-mask {
  position: fixed;
  top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.custom-modal-container {
  background: rgb(69, 69, 69);
  padding: 20px;
  border-radius: 10px;
  border: 1px solid #333;
  width: 35%;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-left: 5px solid #2196f3;
}

/* 根据不同类型显示不同边框颜色 */
.custom-modal-container.success { border-left-color: #4caf50; }
.custom-modal-container.warn { border-left-color: #ff9800; }
.custom-modal-container.error { border-left-color: #f44336; }

.modal-header h3 { margin: 0; font-size: 18px; color: #ececec; }
.modal-body { margin: 15px 0; color: #a5a5a5; font-size: 14px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 13px; }

button {
  padding: 6px 16px;
  cursor: pointer;
  background: #2d2d2d;
  color: #e0e0e0;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 15px;
  transition: all 0.2s ease;
}

button:hover {
  color: #5c5c5c;
}

.btn-confirm {
  background: #2196f3;
  color: white;
}

.success .btn-confirm {
  background: #4caf50;
}

.warn .btn-confirm {
  background: #ff9800;
}

.error .btn-confirm {
  background: #f44336;
}

.btn-cancel {
  background: #eee;
  color: #333;
}

/* 动画效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>