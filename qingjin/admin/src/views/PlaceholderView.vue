<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="page-card">
    <el-empty :description="`「${route.meta.title ?? ''}」功能开发中`" />
  </div>
</template>
