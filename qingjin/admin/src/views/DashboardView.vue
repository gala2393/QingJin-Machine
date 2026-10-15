<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { ArrowDown, ArrowUp, Refresh } from '@element-plus/icons-vue'
import RankList, { type RankItem } from '@/components/RankList.vue'
import { statsApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import type { DeviceType, InquiryChannel, StatsOverview, StatsSummary, StatsTotals } from '@/types/api'
import { formatTime } from '@/utils/format'

use([CanvasRenderer, LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent])

const BUSINESS_TZ = 'Asia/Shanghai'
const MAX_DAYS = 366
const DAY_MS = 86_400_000

const DEVICE_LABELS: Record<DeviceType, string> = { desktop: '电脑', mobile: '手机', tablet: '平板' }
const CHANNEL_LABELS: Record<InquiryChannel, string> = {
  form: '表单',
  email: '邮件',
  whatsapp: 'WhatsApp',
  phone: '电话',
  wechat: '微信',
}
const LANG_LABELS: Record<string, string> = { zh: '中文', en: 'English' }

const KPIS: { key: keyof StatsTotals; label: string }[] = [
  { key: 'pv', label: '浏览量' },
  { key: 'uv', label: '访客（按天去重）' },
  { key: 'machineViews', label: '机型浏览' },
  { key: 'inquiries', label: '询盘点击' },
  { key: 'searches', label: '站内搜索' },
]

const auth = useAuthStore()

const summary = ref<StatsSummary | null>(null)
const overview = ref<StatsOverview | null>(null)
const loading = ref(false)

type Preset = '7' | '30' | '90' | 'custom'
const preset = ref<Preset>('30')
const customRange = ref<[string, string] | null>(null)

// ---------- dates (business timezone) ----------

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ }).format(d)

function presetRange(days: number) {
  const now = new Date()
  return { from: ymd(new Date(now.getTime() - (days - 1) * DAY_MS)), to: ymd(now) }
}

const pickStart = ref<Date | null>(null)

function disabledDate(d: Date) {
  if (d.getTime() > Date.now()) return true
  if (pickStart.value) return Math.abs(d.getTime() - pickStart.value.getTime()) > (MAX_DAYS - 1) * DAY_MS
  return false
}

function onCalendarChange(val: [Date, Date | null] | null) {
  pickStart.value = val && !val[1] ? val[0] : null
}

// ---------- loading ----------

let seq = 0
async function loadOverview() {
  let range: { from: string; to: string } | undefined
  if (preset.value === 'custom') {
    if (!customRange.value) return
    range = { from: customRange.value[0], to: customRange.value[1] }
  } else {
    range = presetRange(Number(preset.value))
  }
  const current = ++seq
  loading.value = true
  try {
    const data = await statsApi.overview(range)
    if (current === seq) overview.value = data
  } catch {
    // Error toast comes from the http interceptor.
  } finally {
    if (current === seq) loading.value = false
  }
}

function loadSummary() {
  statsApi
    .summary()
    .then((s) => (summary.value = s))
    .catch(() => undefined)
}

function refresh() {
  loadSummary()
  loadOverview()
}

function onPresetChange() {
  if (preset.value !== 'custom') {
    customRange.value = null
    loadOverview()
  }
}

function onCustomChange() {
  if (customRange.value) {
    preset.value = 'custom'
    loadOverview()
  }
}

onMounted(refresh)

// ---------- derived ----------

const hasData = computed(() => {
  const o = overview.value
  if (!o) return false
  return o.totals.pv > 0 || o.prevTotals.pv > 0 || o.realtime.pv30m > 0
})

function change(key: keyof StatsTotals) {
  const o = overview.value
  if (!o) return null
  const prev = o.prevTotals[key]
  if (!prev) return null
  return ((o.totals[key] - prev) / prev) * 100
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['zh-CN'], { type: 'region' })
  } catch {
    return null
  }
})()

function countryName(code: string) {
  if (!code || code === 'XX') return '未知'
  try {
    return regionNames?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const topMachines = computed<RankItem[]>(
  () =>
    overview.value?.topMachines.map((m) => ({
      key: m.slug,
      label: m.model ?? m.slug,
      sub: m.nameZh ?? '（已删除）',
      value: m.views,
      to: { path: '/machines', query: { q: m.model ?? m.slug } },
    })) ?? [],
)
const PAGE_NAMES: Record<string, string> = {
  '': '首页',
  products: '产品中心',
  compare: '机型对比',
  about: '关于我们',
  contact: '联系我们',
}

/** "/en/products/kl-y100/" -> "机型 KL-Y100 · 英文"; unknown paths fall back to the raw path. */
function describePath(path: string): string {
  if (path === '/') return '语言选择页'
  const [lang, section = '', slug, extra] = path.split('/').filter(Boolean)
  const langLabel = lang === 'zh' ? '中文' : lang === 'en' ? '英文' : ''
  if (!langLabel || extra) return path
  if (section === 'products' && slug) return `机型 ${slug.toUpperCase()} · ${langLabel}`
  const name = slug ? undefined : PAGE_NAMES[section]
  return name ? `${name} · ${langLabel}` : path
}

const topPages = computed<RankItem[]>(
  () =>
    overview.value?.topPages.map((p) => {
      const label = describePath(p.path)
      return { key: p.path, label, sub: label === p.path ? undefined : p.path, value: p.pv }
    }) ?? [],
)
const referrers = computed<RankItem[]>(
  () =>
    overview.value?.referrers.map((r) => ({ key: r.host, label: r.host, value: r.pv, href: `https://${r.host}` })) ?? [],
)
const countries = computed<RankItem[]>(
  () =>
    overview.value?.countries.map((c) => ({
      key: c.code,
      label: countryName(c.code),
      sub: c.code === 'XX' ? '' : c.code,
      value: c.pv,
    })) ?? [],
)
const langs = computed<RankItem[]>(
  () => overview.value?.langs.map((l) => ({ key: l.lang, label: LANG_LABELS[l.lang] ?? l.lang, value: l.pv })) ?? [],
)
const searches = computed<RankItem[]>(
  () => overview.value?.searches.map((s) => ({ key: s.query, label: s.query, value: s.count })) ?? [],
)
const zeroSearches = computed<RankItem[]>(
  () => overview.value?.zeroResultSearches.map((s) => ({ key: s.query, label: s.query, value: s.count })) ?? [],
)

// ---------- charts ----------

const trendOption = computed(() => {
  const t = overview.value?.trend ?? []
  return {
    color: ['#2563eb', '#10b981', '#f59e0b'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: 'transparent',
      padding: [10, 14],
      textStyle: { color: '#ffffff', fontSize: 13 },
      extraCssText: 'border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); backdrop-filter: blur(8px);',
    },
    legend: { top: 0, data: ['浏览量', '访客', '询盘点击'] },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: t.map((d) => d.date),
      axisLabel: { formatter: (v: string) => v.slice(5), hideOverlap: true, color: '#64748b' },
      axisLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis: [
      {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b' },
      },
      {
        type: 'value',
        minInterval: 1,
        splitLine: { show: false },
        axisLabel: { color: '#64748b' },
      },
    ],
    series: [
      {
        name: '浏览量',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37, 99, 235, 0.22)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0.01)' },
            ],
          },
        },
        data: t.map((d) => d.pv),
      },
      {
        name: '访客',
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.18)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.01)' },
            ],
          },
        },
        data: t.map((d) => d.uv),
      },
      {
        name: '询盘点击',
        type: 'line',
        smooth: true,
        showSymbol: false,
        yAxisIndex: 1,
        lineStyle: { width: 2.5 },
        data: t.map((d) => d.inquiries),
      },
    ],
  }
})

const deviceOption = computed(() => ({
  color: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6'],
  tooltip: {
    trigger: 'item',
    formatter: '{b}：{c}（{d}%）',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderColor: 'transparent',
    padding: [8, 12],
    textStyle: { color: '#ffffff', fontSize: 12 },
    extraCssText: 'border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);',
  },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie',
      radius: ['42%', '70%'],
      center: ['50%', '45%'],
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{d}%', color: '#475569' },
      data: (overview.value?.devices ?? []).map((d) => ({ name: DEVICE_LABELS[d.device] ?? d.device, value: d.uv })),
    },
  ],
}))

const channelOption = computed(() => {
  const list = overview.value?.inquiryChannels ?? []
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      borderColor: 'transparent',
      padding: [8, 12],
      textStyle: { color: '#ffffff', fontSize: 12 },
      extraCssText: 'border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);',
    },
    grid: { left: 8, right: 28, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'category',
      data: list.map((c) => CHANNEL_LABELS[c.channel] ?? c.channel),
      inverse: true,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      axisLabel: { color: '#475569' },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#60a5fa' },
              { offset: 1, color: '#2563eb' },
            ],
          },
        },
        data: list.map((c) => c.count),
        label: { show: true, position: 'right', color: '#64748b', fontSize: 12 },
      },
    ],
  }
})
</script>

<template>
  <div class="dashboard">
    <div class="head">
      <div class="welcome-wrap">
        <h2 class="welcome">欢迎回来，{{ auth.user?.displayName }}。</h2>
        <p class="welcome-sub">工业多语言展厅数据看板 · 实时与汇总统计</p>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <!-- summary -->
    <el-row :gutter="16">
      <el-col :xs="12" :md="6">
        <el-card shadow="never" class="stat">
          <div class="label">机型总数</div>
          <div class="value">{{ summary?.machines.total ?? '--' }}</div>
          <div v-if="summary" class="hint">
            已上架 {{ summary.machines.published }} · 草稿 {{ summary.machines.draft }} · 隐藏 {{ summary.machines.hidden }}
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :md="6">
        <el-card shadow="never" class="stat">
          <div class="label">分类数量</div>
          <div class="value">{{ summary?.categories ?? '--' }}</div>
          <div class="hint"><RouterLink to="/categories">管理分类</RouterLink></div>
        </el-card>
      </el-col>
      <el-col :xs="12" :md="6">
        <el-card shadow="never" class="stat">
          <div class="label">线上版本</div>
          <div class="value">{{ summary ? (summary.liveVersion != null ? `v${summary.liveVersion}` : '未发布') : '--' }}</div>
          <div class="hint">
            <RouterLink v-if="summary?.pendingChanges" to="/releases">
              <el-tag type="warning" size="small">有待发布改动</el-tag>
            </RouterLink>
            <span v-else-if="summary">线上已是最新</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :md="6">
        <el-card shadow="never" class="stat">
          <div class="label">今日</div>
          <div class="value">{{ summary?.today.pv ?? '--' }}<small> 浏览</small></div>
          <div v-if="summary" class="hint">访客 {{ summary.today.uv }} · 询盘 {{ summary.today.inquiries }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- range -->
    <div class="page-card range-bar">
      <el-radio-group v-model="preset" size="small" @change="onPresetChange">
        <el-radio-button value="7">近7天</el-radio-button>
        <el-radio-button value="30">近30天</el-radio-button>
        <el-radio-button value="90">近90天</el-radio-button>
        <el-radio-button value="custom" :disabled="!customRange">自定义</el-radio-button>
      </el-radio-group>
      <el-date-picker
        v-model="customRange"
        type="daterange"
        size="small"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        :disabled-date="disabledDate"
        :clearable="false"
        class="picker"
        @calendar-change="onCalendarChange"
        @change="onCustomChange"
      />
      <span class="spacer" />
      <span v-if="overview" class="realtime">
        <span class="dot" />最近30分钟：{{ overview.realtime.pv30m }} 次浏览，{{ overview.realtime.visitors30m }} 位访客
      </span>
    </div>

    <div v-loading="loading && !overview">
      <template v-if="overview">
        <p class="range-text">
          {{ overview.range.from }} 至 {{ overview.range.to }}（{{ overview.range.days }} 天），与之前同长度时段对比 · 生成于
          {{ formatTime(overview.generatedAt) }}
        </p>

        <div class="kpis">
          <el-card v-for="k in KPIS" :key="k.key" shadow="never" class="kpi">
            <div class="label">{{ k.label }}</div>
            <div class="value">{{ overview.totals[k.key].toLocaleString() }}</div>
            <div class="hint">
              <template v-if="change(k.key) === null">—</template>
              <span v-else :class="change(k.key)! >= 0 ? 'up' : 'down'">
                <el-icon><ArrowUp v-if="change(k.key)! >= 0" /><ArrowDown v-else /></el-icon>
                {{ Math.abs(change(k.key)!).toFixed(1) }}%
              </span>
              <span class="prev">上期 {{ overview.prevTotals[k.key].toLocaleString() }}</span>
            </div>
          </el-card>
        </div>

        <div v-if="!hasData" class="page-card">
          <el-empty description="还没有访问数据。网站发布后，访客浏览会自动统计（不使用 Cookie）。" />
        </div>

        <template v-else>
          <div class="page-card block">
            <h3 class="panel-title">访问趋势</h3>
            <VChart class="chart trend" :option="trendOption" autoresize />
          </div>

          <el-row :gutter="16">
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">热门机型</h3>
                <RankList :items="topMachines" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">热门页面</h3>
                <RankList :items="topPages" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">来源网站</h3>
                <RankList :items="referrers" empty="暂无外部来源（直接访问或搜索引擎未传递来源）" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">国家/地区</h3>
                <RankList :items="countries" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">设备（访客）</h3>
                <VChart v-if="overview.devices.length" class="chart small" :option="deviceOption" autoresize />
                <p v-else class="muted">暂无数据</p>
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">语言</h3>
                <RankList :items="langs" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">询盘渠道</h3>
                <VChart v-if="overview.inquiryChannels.length" class="chart small" :option="channelOption" autoresize />
                <p v-else class="muted">暂无询盘点击</p>
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">热门搜索词</h3>
                <RankList :items="searches" unit=" 次" />
              </div>
            </el-col>
            <el-col :xs="24" :md="12" :lg="8">
              <div class="page-card panel">
                <h3 class="panel-title">无结果搜索词</h3>
                <p class="muted">访客搜索了但没有找到结果，可以考虑补充这些机型或别名。</p>
                <RankList :items="zeroSearches" unit=" 次" />
              </div>
            </el-col>
          </el-row>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.welcome-wrap {
  display: flex;
  flex-direction: column;
}

.welcome {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.welcome-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat,
.kpi {
  margin-bottom: 16px;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
  background: #ffffff;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: var(--qj-shadow-card);
}

.stat:hover,
.kpi:hover {
  transform: translateY(-2px);
  box-shadow: var(--qj-shadow-hover);
  border-color: #cbd5e1;
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
}

.value {
  margin: 10px 0 6px;
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.value small {
  font-size: 13px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 20px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.hint a {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.range-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px 18px;
  border-radius: 12px;
}

.picker {
  max-width: 280px;
}

.spacer {
  flex: 1;
}

.realtime {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  padding: 4px 10px;
  background: var(--el-fill-color-light);
  border-radius: 20px;
  border: 1px solid var(--el-border-color-lighter);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

.range-text {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.kpis .kpi {
  margin-bottom: 0;
}

.kpis + * {
  margin-top: 16px;
}

.up {
  color: #059669;
  background: #ecfdf5;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
}

.down {
  color: #dc2626;
  background: #fef2f2;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 600;
}

.up,
.down {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.prev {
  color: var(--el-text-color-placeholder);
  font-size: 11.5px;
}

.block {
  margin-bottom: 16px;
}

.panel {
  margin-bottom: 16px;
  min-height: 220px;
}

.panel-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.chart {
  width: 100%;
}

.chart.trend {
  height: 330px;
}

.chart.small {
  height: 240px;
}

.muted {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 1200px) {
  .kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .value {
    font-size: 22px;
  }

  .picker {
    max-width: 100%;
  }

  .chart.trend {
    height: 260px;
  }
}
</style>
