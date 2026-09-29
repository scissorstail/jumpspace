import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'Layout',
    component: () => import('../views/Layout.vue')
  }
]

const router = new VueRouter({
  mode: 'hash',
  routes
})

export default router
