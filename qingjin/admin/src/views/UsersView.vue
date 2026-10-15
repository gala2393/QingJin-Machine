<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { CopyDocument, Plus, Refresh } from '@element-plus/icons-vue'
import { usersApi } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types/api'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_TAG, USERNAME_RE, type AdminUser } from '@/types/admin'
import { formatTime } from '@/utils/format'

const ROLES: Role[] = ['SUPER_ADMIN', 'EDITOR', 'VIEWER']

const auth = useAuthStore()
const users = ref<AdminUser[]>([])
const loading = ref(false)
const toggling = ref<string | null>(null)

const isSelf = (u: AdminUser) => u.id === auth.user?.id

async function load() {
  loading.value = true
  try {
    users.value = await usersApi.list()
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    loading.value = false
  }
}

function replaceUser(next: AdminUser) {
  const i = users.value.findIndex((u) => u.id === next.id)
  if (i >= 0) users.value[i] = next
  else users.value.push(next)
}

// ---------- password helpers ----------

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?'

function randomPassword(length = 14): string {
  const out: string[] = []
  const buf = new Uint32Array(1)
  // Rejection sampling keeps every character equally likely.
  const limit = Math.floor(0x100000000 / PASSWORD_CHARS.length) * PASSWORD_CHARS.length
  while (out.length < length) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) out.push(PASSWORD_CHARS[buf[0] % PASSWORD_CHARS.length])
  }
  return out.join('')
}

async function copyText(text: string) {
  if (!text) return
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动复制')
  }
}

const passwordRule = {
  validator: (_r: unknown, v: string, cb: (e?: Error) => void) => {
    if (!v) cb(new Error('请输入密码'))
    else if (v.length < 10 || v.length > 100) cb(new Error('密码长度为 10–100 个字符'))
    else cb()
  },
  trigger: 'blur',
}

// ---------- create / edit ----------

const editOpen = ref(false)
const editing = ref<AdminUser | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ username: '', displayName: '', role: 'EDITOR' as Role, password: '' })

const rules = computed<FormRules>(() => ({
  username: editing.value
    ? []
    : [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { pattern: USERNAME_RE, message: '3–32 位，仅限字母、数字、下划线、点和短横线', trigger: 'blur' },
      ],
  displayName: [
    { required: true, message: '请输入显示名', trigger: 'blur' },
    { max: 50, message: '显示名不能超过 50 个字符', trigger: 'blur' },
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  password: editing.value ? [] : [passwordRule],
}))

function openCreate() {
  editing.value = null
  Object.assign(form, { username: '', displayName: '', role: 'EDITOR', password: randomPassword() })
  editOpen.value = true
  formRef.value?.clearValidate()
}

function openEdit(u: AdminUser) {
  editing.value = u
  Object.assign(form, { username: u.username, displayName: u.displayName, role: u.role, password: '' })
  editOpen.value = true
  formRef.value?.clearValidate()
}

async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    if (editing.value) {
      const body: { displayName: string; role?: Role } = { displayName: form.displayName.trim() }
      if (!isSelf(editing.value) && form.role !== editing.value.role) body.role = form.role
      replaceUser(await usersApi.update(editing.value.id, body))
      ElMessage.success('已保存')
    } else {
      const created = await usersApi.create({
        username: form.username.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        password: form.password,
      })
      replaceUser(created)
      ElMessage.success(`已创建用户 ${created.username}，请将密码告知对方`)
    }
    editOpen.value = false
  } catch {
    // 400 / 409 messages are shown by the http interceptor.
  } finally {
    saving.value = false
  }
}

// ---------- reset password ----------

const resetOpen = ref(false)
const resetUser = ref<AdminUser | null>(null)
const resetting = ref(false)
const resetFormRef = ref<FormInstance>()
const resetForm = reactive({ password: '' })
const resetRules: FormRules = { password: [passwordRule] }

function openReset(u: AdminUser) {
  resetUser.value = u
  resetForm.password = randomPassword()
  resetOpen.value = true
  resetFormRef.value?.clearValidate()
}

async function confirmReset() {
  if (!resetUser.value) return
  if (!(await resetFormRef.value?.validate().catch(() => false))) return
  resetting.value = true
  try {
    await usersApi.resetPassword(resetUser.value.id, resetForm.password)
    ElMessage.success(`已重置 ${resetUser.value.username} 的密码，对方需重新登录`)
    resetOpen.value = false
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    resetting.value = false
  }
}

// ---------- active / delete ----------

async function toggleActive(u: AdminUser, next: boolean) {
  if (!next) {
    try {
      await ElMessageBox.confirm(`停用后 ${u.displayName}（${u.username}）将立即被登出且无法登录，确定停用？`, '停用用户', {
        type: 'warning',
        confirmButtonText: '停用',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
  }
  toggling.value = u.id
  try {
    replaceUser(await usersApi.update(u.id, { active: next }))
    ElMessage.success(next ? '已启用' : '已停用')
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    toggling.value = null
  }
}

async function remove(u: AdminUser) {
  try {
    await ElMessageBox.confirm(
      `确定删除用户 ${u.displayName}（${u.username}）？删除后无法恢复，其操作日志会保留并显示为“已删除用户”。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await usersApi.remove(u.id)
    users.value = users.value.filter((x) => x.id !== u.id)
    ElMessage.success('已删除')
  } catch {
    // 400 message is shown by the http interceptor.
  }
}

const narrowQuery = window.matchMedia('(max-width: 768px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (e: MediaQueryListEvent) => (narrow.value = e.matches)

onMounted(() => {
  narrowQuery.addEventListener('change', onNarrowChange)
  load()
})
onBeforeUnmount(() => narrowQuery.removeEventListener('change', onNarrowChange))
</script>

<template>
  <div class="page-card">
    <div class="page-toolbar">
      <h2 class="section-title">用户与角色</h2>
      <span class="spacer" />
      <el-button :icon="Refresh" :disabled="loading" @click="load">刷新</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增用户</el-button>
    </div>

    <el-table v-loading="loading" :data="users" row-key="id" border style="width: 100%">
      <el-table-column label="用户名" min-width="140">
        <template #default="{ row }">
          <span class="username">{{ row.username }}</span>
          <el-tag v-if="isSelf(row as AdminUser)" size="small" type="success" effect="dark" class="ml">我</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="displayName" label="显示名" min-width="120" show-overflow-tooltip />
      <el-table-column label="角色" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="ROLE_TAG[row.role as Role]" size="small">{{ ROLE_LABELS[row.role as Role] ?? row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tooltip :disabled="!isSelf(row as AdminUser)" content="不能停用自己" placement="top">
            <el-switch
              :model-value="row.active"
              :disabled="isSelf(row as AdminUser)"
              :loading="toggling === row.id"
              inline-prompt
              active-text="启用"
              inactive-text="停用"
              @change="(v: string | number | boolean) => toggleActive(row as AdminUser, !!v)"
            />
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="150">
        <template #default="{ row }">{{ row.lastLoginAt ? formatTime(row.lastLoginAt) : '从未登录' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" :width="narrow ? 170 : 200" :fixed="narrow ? false : 'right'">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row as AdminUser)">编辑</el-button>
          <el-button link type="warning" @click="openReset(row as AdminUser)">重置密码</el-button>
          <el-button link type="danger" :disabled="isSelf(row as AdminUser)" @click="remove(row as AdminUser)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增 / 编辑 -->
    <el-dialog
      v-model="editOpen"
      :title="editing ? '编辑用户' : '新增用户'"
      width="520px"
      class="qj-dialog"
      append-to-body
      :close-on-click-modal="!saving"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            :disabled="!!editing"
            maxlength="32"
            placeholder="登录用，3–32 位字母、数字、_ . -"
            autocomplete="off"
          />
          <div v-if="editing" class="hint">用户名创建后不可修改</div>
        </el-form-item>
        <el-form-item label="显示名" prop="displayName">
          <el-input v-model="form.displayName" maxlength="50" placeholder="例如：张三" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select
            v-model="form.role"
            :disabled="!!editing && isSelf(editing)"
            style="width: 100%"
          >
            <el-option v-for="r in ROLES" :key="r" :label="ROLE_LABELS[r]" :value="r">
              <span>{{ ROLE_LABELS[r] }}</span>
              <span class="option-desc">{{ ROLE_DESCRIPTIONS[r] }}</span>
            </el-option>
          </el-select>
          <div class="hint">
            {{ ROLE_DESCRIPTIONS[form.role] }}
            <template v-if="editing && isSelf(editing)">（不能修改自己的角色）</template>
            <template v-else-if="editing">（修改角色后对方会被立即登出）</template>
          </div>
        </el-form-item>
        <el-form-item v-if="!editing" label="初始密码" prop="password">
          <div class="password-row">
            <el-input v-model="form.password" maxlength="100" autocomplete="new-password" class="mono" />
            <el-button @click="form.password = randomPassword()">生成随机密码</el-button>
            <el-button :icon="CopyDocument" @click="copyText(form.password)">复制</el-button>
          </div>
          <div class="hint">至少 10 个字符。请复制后告知对方，关闭对话框后无法再次查看。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="saving" @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog
      v-model="resetOpen"
      title="重置密码"
      width="520px"
      class="qj-dialog"
      append-to-body
      :close-on-click-modal="!resetting"
    >
      <p v-if="resetUser" class="dialog-tip">
        为 <b>{{ resetUser.displayName }}（{{ resetUser.username }}）</b> 设置新密码。重置后该用户在所有设备上都会被登出。
      </p>
      <el-form ref="resetFormRef" :model="resetForm" :rules="resetRules" label-position="top" @submit.prevent>
        <el-form-item label="新密码" prop="password">
          <div class="password-row">
            <el-input v-model="resetForm.password" maxlength="100" autocomplete="new-password" class="mono" />
            <el-button @click="resetForm.password = randomPassword()">生成随机密码</el-button>
            <el-button :icon="CopyDocument" @click="copyText(resetForm.password)">复制</el-button>
          </div>
          <div class="hint">至少 10 个字符。请复制后告知对方。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="resetting" @click="resetOpen = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="confirmReset">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.username {
  font-weight: 500;
}

.ml {
  margin-left: 6px;
}

.hint {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.option-desc {
  float: right;
  margin-left: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.password-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.password-row .el-input {
  flex: 1 1 200px;
}

.password-row .el-button + .el-button {
  margin-left: 0;
}

.mono :deep(input) {
  font-family: Consolas, 'Courier New', monospace;
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
</style>
