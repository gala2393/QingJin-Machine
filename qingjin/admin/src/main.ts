import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './styles/main.css'

import App from './App.vue'
import router from './router'
import { configureHttp } from './api/http'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

const auth = useAuthStore(pinia)
configureHttp({
  onRefreshed: (data) => auth.applyAuth(data),
  onUnauthorized: () => {
    auth.clear()
    const current = router.currentRoute.value
    if (current.name !== 'login') {
      router.replace({ name: 'login', query: { redirect: current.fullPath } })
    }
  },
})

app.mount('#app')
