import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import VideoExportRenderWindow from './components/player/VideoExportRenderWindow.vue'
import './style.css'

const isVideoExportRenderWindow = new URLSearchParams(window.location.search).has('videoExportRender')
const app = createApp(isVideoExportRenderWindow ? VideoExportRenderWindow : App)
const pinia = createPinia()

app.use(pinia)

app.mount('#app')

if (!isVideoExportRenderWindow) {
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault()
  }, false)
}
