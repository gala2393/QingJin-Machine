<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export interface RankItem {
  key: string
  label: string
  sub?: string
  value: number
  to?: RouteLocationRaw
  href?: string
}

const props = withDefaults(defineProps<{ items: RankItem[]; unit?: string; empty?: string }>(), {
  unit: '',
  empty: '暂无数据',
})

const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))
</script>

<template>
  <ol v-if="items.length" class="rank">
    <li v-for="(item, index) in items" :key="item.key" class="rank-item">
      <div class="line">
        <span class="rank-badge" :class="`rank-${index + 1}`">{{ index + 1 }}</span>
        <span class="label" :title="item.label">
          <RouterLink v-if="item.to" :to="item.to" class="rank-link">{{ item.label }}</RouterLink>
          <a v-else-if="item.href" :href="item.href" target="_blank" rel="noopener noreferrer" class="rank-link">{{ item.label }}</a>
          <template v-else>{{ item.label }}</template>
          <span v-if="item.sub" class="sub">{{ item.sub }}</span>
        </span>
        <span class="value">{{ item.value.toLocaleString() }}{{ unit }}</span>
      </div>
      <div class="bar"><span :style="{ width: `${(item.value / max) * 100}%` }" /></div>
    </li>
  </ol>
  <p v-else class="empty">{{ empty }}</p>
</template>

<style scoped>
.rank {
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank-item {
  padding: 6px 4px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.rank-item:hover {
  background: #f8fafc;
}

.rank-item + .rank-item {
  margin-top: 4px;
}

.line {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.rank-badge {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  background: #e2e8f0;
  color: #64748b;
}

.rank-badge.rank-1 {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  box-shadow: 0 2px 5px rgba(245, 158, 11, 0.35);
}

.rank-badge.rank-2 {
  background: linear-gradient(135deg, #94a3b8, #64748b);
  color: #ffffff;
  box-shadow: 0 2px 5px rgba(100, 116, 139, 0.25);
}

.rank-badge.rank-3 {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: #ffffff;
  box-shadow: 0 2px 5px rgba(180, 83, 9, 0.25);
}

.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.rank-link {
  color: var(--el-color-primary);
  text-decoration: none;
  transition: color 0.15s ease;
}

.rank-link:hover {
  color: var(--el-color-primary-dark-2);
  text-decoration: underline;
}

.sub {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.value {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #334155;
  font-size: 13px;
}

.bar {
  height: 5px;
  margin-top: 5px;
  margin-left: 28px;
  border-radius: 3px;
  background: #f1f5f9;
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #60a5fa, #2563eb);
  transition: width 0.4s ease;
}

.empty {
  margin: 12px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  text-align: center;
}
</style>
