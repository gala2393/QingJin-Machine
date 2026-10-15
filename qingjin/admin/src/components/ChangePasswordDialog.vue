<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { authApi } from '@/api'

const visible = defineModel<boolean>({ required: true })

const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({ currentPassword: '', newPassword: '', confirm: '' })

const differentValidator: FormItemRule['validator'] = (_r, value: string, cb) => {
  if (value && value === form.currentPassword) return cb(new Error('新密码不能与当前密码相同'))
  cb()
}
const confirmValidator: FormItemRule['validator'] = (_r, value: string, cb) => {
  if (value !== form.newPassword) return cb(new Error('两次输入的新密码不一致'))
  cb()
}

const rules: FormRules<typeof form> = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 10, max: 100, message: '新密码长度为 10–100 个字符', trigger: 'blur' },
    { validator: differentValidator, trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: confirmValidator, trigger: 'blur' },
  ],
}

watch(visible, (open) => {
  if (!open) return
  Object.assign(form, { currentPassword: '', newPassword: '', confirm: '' })
  formRef.value?.clearValidate()
})

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    ElMessage.success('密码已修改，其他设备上的登录已失效')
    visible.value = false
  } catch {
    // 400 (wrong current password etc.) is shown by the http interceptor.
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="修改密码" width="420px" class="qj-dialog" append-to-body :close-on-click-modal="false">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="submit">
      <el-form-item label="当前密码" prop="currentPassword">
        <el-input v-model="form.currentPassword" type="password" show-password autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input
          v-model="form.newPassword"
          type="password"
          show-password
          autocomplete="new-password"
          placeholder="至少 10 个字符"
        />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirm">
        <el-input v-model="form.confirm" type="password" show-password autocomplete="new-password" />
      </el-form-item>
      <button type="submit" hidden />
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">确认修改</el-button>
    </template>
  </el-dialog>
</template>
