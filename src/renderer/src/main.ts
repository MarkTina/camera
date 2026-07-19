import './styles/base.css'
import './styles/floating-window.css'
import './styles/annotation.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

createApp(App).use(createPinia()).mount('#app')
