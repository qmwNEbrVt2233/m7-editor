import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import VideoExportRenderWindow from './components/player/VideoExportRenderWindow.vue'
import './style.css'

const renderWindowParams = new URLSearchParams(window.location.search)
const isRenderWindow = renderWindowParams.has('videoExportRender') || renderWindowParams.has('videoFrameRender')
const app = createApp(isRenderWindow ? VideoExportRenderWindow : App)
const pinia = createPinia()

app.use(pinia)

app.mount('#app')

if (!isRenderWindow) {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
  }, false)
}
