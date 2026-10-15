<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, Message, Phone, TopRight, User, WarningFilled } from '@element-plus/icons-vue'
import { usePublicInfo } from '@/composables/usePublicInfo'
import { useAuthStore } from '@/stores/auth'

const REMEMBER_KEY = 'qj-admin-remember-username'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const shake = ref(false)
const capsLock = ref(false)
const remembered = localStorage.getItem(REMEMBER_KEY)
const remember = ref(remembered !== null)
const form = reactive({ username: remembered ?? '', password: '' })
const contact = usePublicInfo()

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const base = import.meta.env.BASE_URL
const logoUrl = `${base}logo.png`
const heroUrl = `${base}login-hero.webp`
const year = new Date().getFullYear()

const highlights = [
  { title: '机型管理', desc: '参数、图片、中英文介绍集中维护' },
  { title: '先预览再发布', desc: '确认无误后一键更新官网' },
  { title: '随时回滚', desc: '发布出错可恢复到任意历史版本' },
]

function onKey(e: Event) {
  if (e instanceof KeyboardEvent && typeof e.getModifierState === 'function') {
    capsLock.value = e.getModifierState('CapsLock')
  }
}

function safeRedirect(): string {
  const target = route.query.redirect
  // Only allow in-app paths to avoid open redirects such as "//evil.com".
  if (typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/login')) {
    return target
  }
  return '/dashboard'
}

function playShake() {
  shake.value = false
  requestAnimationFrame(() => (shake.value = true))
}

async function submit() {
  if (loading.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) {
    playShake()
    return
  }
  loading.value = true
  try {
    const username = form.username.trim()
    await auth.login({ username, password: form.password })
    if (remember.value) localStorage.setItem(REMEMBER_KEY, username)
    else localStorage.removeItem(REMEMBER_KEY)
    await router.replace(safeRedirect())
  } catch {
    // Error toast is shown by the http interceptor.
    form.password = ''
    playShake()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <aside class="hero" :style="{ backgroundImage: `url(${heroUrl})` }">
      <div class="hero-overlay"></div>
      <div class="hero-inner">
        <div class="hero-brand">
          <span class="hero-logo"><img :src="logoUrl" alt="青瑾机械" /></span>
          <span class="hero-brand-text">
            <b>青瑾机械</b>
            <small>QING JIN MACHINERY</small>
          </span>
        </div>

        <div class="hero-copy">
          <span class="hero-eyebrow">官网内容管理后台</span>
          <h1>让每一台好机器<br />都被客户看见</h1>
          <p>在这里维护机型与图片、修改站点信息，预览确认后一键发布到中英文官网。</p>
          <ul class="hero-points">
            <li v-for="h in highlights" :key="h.title">
              <b>{{ h.title }}</b>
              <span>{{ h.desc }}</span>
            </li>
          </ul>
        </div>

        <div class="hero-foot">中文 · English 双语官网 · 产品展示与内容管理</div>
      </div>
    </aside>

    <main class="panel">
      <div class="panel-top">
        <a v-if="contact?.siteUrl" :href="contact.siteUrl" target="_blank" rel="noopener noreferrer" class="site-pill">
          访问官网<el-icon><TopRight /></el-icon>
        </a>
      </div>

      <div class="panel-inner" :class="{ shake }" @animationend="shake = false">
        <div class="mobile-brand">
          <span class="hero-logo"><img :src="logoUrl" alt="青瑾机械" /></span>
          <b>青瑾机械 后台管理</b>
        </div>

        <h2 class="welcome">欢迎登录</h2>
        <p class="welcome-sub">请使用管理员分配的账号登录后台</p>

        <el-form ref="formRef" :model="form" :rules="rules" size="large" label-position="top" class="login-form" @submit.prevent="submit">
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              :prefix-icon="User"
              autocomplete="username"
              :autofocus="!form.username"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              :prefix-icon="Lock"
              autocomplete="current-password"
              show-password
              :autofocus="!!form.username"
              @keydown="onKey"
              @keyup="onKey"
              @blur="capsLock = false"
            />
            <div v-if="capsLock" class="caps-tip">
              <el-icon><WarningFilled /></el-icon>
              大写锁定已开启，密码区分大小写
            </div>
          </el-form-item>

          <div class="form-row">
            <el-checkbox v-model="remember">记住用户名</el-checkbox>
            <el-tooltip content="请联系超级管理员在「用户与角色」中重置密码" placement="top">
              <span class="forgot">忘记密码？</span>
            </el-tooltip>
          </div>

          <el-button type="primary" native-type="submit" :loading="loading" class="submit">
            {{ loading ? '正在登录…' : '登 录' }}
          </el-button>
        </el-form>

        <div v-if="contact && (contact.phone || contact.email)" class="help">
          <div class="help-title">登录遇到问题？</div>
          <div class="contact">
            <span v-if="contact.phone"><el-icon><Phone /></el-icon>{{ contact.phone }}</span>
            <span v-if="contact.email"><el-icon><Message /></el-icon>{{ contact.email }}</span>
          </div>
        </div>
      </div>

      <div class="panel-bottom">© {{ year }} {{ contact?.name || '青瑾机械' }} · 版权所有</div>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  --brand: #1f4fae;
  --brand-hover: #163d8b;
  --navy: #0f2754;
  --yellow: #f6c244;
  min-height: 100%;
  display: flex;
  background: #f4f6fa;
}

/* ---------- 左侧主图 ---------- */
.hero {
  position: relative;
  flex: 1 1 60%;
  min-height: 100vh;
  background-size: cover;
  background-position: center;
  color: #fff;
  overflow: hidden;
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, rgba(15, 39, 84, 0.94) 0%, rgba(15, 39, 84, 0.82) 42%, rgba(31, 79, 174, 0.45) 100%);
}

.hero-inner {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 40px 56px;
}

.hero-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
}

.hero-logo img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}

.hero-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.hero-brand-text b {
  font-size: 18px;
  letter-spacing: 0.04em;
}

.hero-brand-text small {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.65);
}

.hero-copy {
  margin: auto 0;
  max-width: 520px;
}

.hero-eyebrow {
  display: inline-block;
  padding-left: 12px;
  border-left: 3px solid var(--yellow);
  font-size: 14px;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.85);
}

.hero-copy h1 {
  margin: 18px 0 16px;
  font-size: 40px;
  line-height: 1.3;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.hero-copy p {
  margin: 0 0 32px;
  font-size: 15px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.78);
}

.hero-points {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}

.hero-points li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(4px);
}

.hero-points b {
  font-size: 14px;
}

.hero-points b::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--yellow);
  vertical-align: middle;
}

.hero-points span {
  padding-left: 14px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.65);
}

.hero-foot {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

/* ---------- 右侧表单 ---------- */
.panel {
  position: relative;
  flex: 0 0 40%;
  min-width: 440px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 40px;
  background:
    radial-gradient(circle at 85% 12%, rgba(47, 124, 246, 0.14), transparent 42%),
    radial-gradient(circle at 10% 92%, rgba(246, 194, 68, 0.14), transparent 40%),
    radial-gradient(rgba(31, 79, 174, 0.09) 1px, transparent 1px) 0 0 / 22px 22px,
    #f4f6fa;
}

.panel-top {
  align-self: stretch;
  display: flex;
  justify-content: flex-end;
  min-height: 34px;
}

.site-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #dbe3f0;
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 2px 6px rgba(15, 39, 84, 0.06);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.site-pill:hover {
  border-color: var(--brand);
  box-shadow: 0 4px 12px rgba(31, 79, 174, 0.15);
}

.panel-inner {
  width: 100%;
  max-width: 440px;
  margin: auto 0;
  padding: 40px 40px 32px;
  background: #fff;
  border-radius: 18px;
  border: 1px solid #e6ebf3;
  border-top: 4px solid var(--brand);
  box-shadow: 0 24px 48px -16px rgba(15, 39, 84, 0.18);
  animation: rise 0.45s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-bottom {
  font-size: 12px;
  color: #94a3b8;
}

.panel-inner.shake {
  animation: shake 0.4s ease;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

.mobile-brand {
  display: none;
}

.welcome {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  color: var(--navy);
}

.welcome-sub {
  margin: 8px 0 32px;
  font-size: 14px;
  color: #64748b;
}

.login-form :deep(.el-form-item__label) {
  font-weight: 600;
  color: #334155;
}

.login-form :deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 2px 14px;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--brand) inset, 0 0 0 4px rgba(31, 79, 174, 0.12);
}

.caps-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #d97706;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: -4px 0 22px;
}

.forgot {
  font-size: 13px;
  color: var(--brand);
  cursor: help;
}

.submit {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.1em;
  border-radius: 10px;
  border: none;
  background: var(--brand);
  box-shadow: 0 8px 20px rgba(31, 79, 174, 0.28);
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.submit:hover,
.submit:focus-visible {
  background: var(--brand-hover);
  box-shadow: 0 10px 24px rgba(31, 79, 174, 0.36);
  transform: translateY(-1px);
}

.help {
  margin-top: 28px;
  padding: 14px 16px;
  border-radius: 12px;
  background: #f4f6fa;
  font-size: 12px;
}

.help-title {
  margin-bottom: 6px;
  font-weight: 600;
  color: #334155;
}

.contact {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  color: #64748b;
}

.contact span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 900px) {
  .hero {
    display: none;
  }

  .panel {
    flex: 1;
    min-width: 0;
    min-height: 100vh;
    padding: 20px 16px;
  }

  .panel-inner {
    padding: 32px 22px 24px;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
    color: var(--navy);
    font-size: 16px;
  }

  .mobile-brand .hero-logo {
    width: 38px;
    height: 38px;
    border: 1px solid #e2e8f0;
    box-shadow: none;
  }
}
</style>
