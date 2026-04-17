<template>
  <div class="player">
    <div class="screen">
      <DanmakuLayer />
    </div>

    <button @click="toggle">
      {{ store.playing ? '暂停' : '播放' }}
    </button>
    <button @click="save">保存工程</button>
    <button @click="load">加载工程</button>
    <button @click="download">导出JSON</button>
    <input type="file" @change="onFileChange" />
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '../../store/editor'
import DanmakuLayer from './DanmakuLayer.vue'

const store = useEditorStore()

function toggle() {
  if (store.playing) {
    store.pausePlayback()
  } else {
    store.startPlayback()
  }
}

function save() {
  store.saveToLocal()
}

function load() {
  store.loadFromLocal()
}

function download() {
  store.downloadProject()
}

function onFileChange(e: any) {
  const file = e.target.files[0]
  if (file) {
    store.loadFromFile(file)
  }
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