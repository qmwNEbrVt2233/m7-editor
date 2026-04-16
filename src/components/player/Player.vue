<template>
  <div class="player">
    <div class="screen">
      <DanmakuLayer />
    </div>

    <button @click="toggle">
      {{ store.playing ? '暂停' : '播放' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '../../store/editor'
import DanmakuLayer from './DanmakuLayer.vue'

const store = useEditorStore()

function toggle() {
  store.togglePlay()
}
</script>

<style scoped>
.screen {
  width: 800px;
  height: 450px;
  background: black;
  position: relative;
}
</style>