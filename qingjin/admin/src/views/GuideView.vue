<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const openFaq = ref<string[]>([])

interface Step {
  title: string
  where: string
  path?: string
  points: string[]
}

const flow: Step[] = [
  {
    title: '修改内容',
    where: '机型管理、站点设置等',
    path: '/machines',
    points: [
      '新增或编辑机型，填写型号、名称、参数和图片后点击「保存」。',
      '新机型默认是「草稿」，在列表里点击绿色的「上架」按钮，官网才会收录它。',
      '保存只是存到后台，官网暂时不会变化，可以放心修改。',
    ],
  },
  {
    title: '生成预览',
    where: '发布中心 → 待发布改动',
    path: '/releases',
    points: [
      '「待发布改动」会列出自上次发布以来改了哪些内容。',
      '点击「生成预览」，等待十几秒，再点击「打开预览」。',
      '预览是一个只有您能看到的临时网站，和正式官网长得一模一样，用来检查文字、图片是否正确。',
    ],
  },
  {
    title: '发布上线',
    where: '发布中心 → 发布上线',
    path: '/releases',
    points: [
      '预览确认无误后，点击「发布上线」，可以写一句备注（例如“新增 KL-Y100”），再点「确认发布」。',
      '大约 20–30 秒后，发布历史里出现带「线上」标记的新版本，官网就已更新。',
      '发布期间请不要关闭页面；如果失败，点「日志」查看原因，官网会保持原样，不受影响。',
    ],
  },
  {
    title: '出错时回滚',
    where: '发布中心 → 发布历史',
    path: '/releases',
    points: [
      '如果发布后发现问题，在「发布历史」中找到之前正常的版本，点击「回滚到此版本」。',
      '确认后系统会用那个版本的内容重新生成网站（约 20–30 秒），完成后官网恢复成当时的样子，发布历史里会多一条「回滚自 vX」的记录。',
      '回滚只改变官网显示，不会删除后台里的数据；修正内容后重新发布即可。',
    ],
  },
]

const faqs = [
  {
    name: 'not-showing',
    q: '我改了机型，为什么官网没有变化？',
    a: '后台的修改需要「发布」后才会出现在官网。请先确认机型状态是「已上架」，然后到发布中心点击「发布上线」。',
  },
  {
    name: 'draft',
    q: '草稿、已上架、已下架有什么区别？',
    a: '草稿：还没准备好，官网不显示；已上架：发布后官网显示；已下架：暂时从官网撤下，数据保留，随时可以重新上架。',
  },
  {
    name: 'url',
    q: '「网址设置」「参数模板」里的英文需要我填吗？',
    a: '一般不需要。系统会根据型号和英文名称自动生成网址，参数也会自动匹配，只有在特殊需要时才去修改。',
  },
  {
    name: 'preview-old',
    q: '预览显示的不是最新内容？',
    a: '预览是点击「生成预览」那一刻的快照。之后又做了修改，需要重新点击「生成预览」。',
  },
  {
    name: 'rollback-data',
    q: '回滚之后，后台数据会变回去吗？',
    a: '不会。回滚只切换官网显示的版本，后台数据保持您最后一次保存的样子。下次发布时，官网会更新为后台的最新内容。',
  },
]
</script>

<template>
  <div class="guide">
    <section class="page-card intro">
      <h2 class="title">网站更新三步走：修改 → 预览 → 发布</h2>
      <p class="desc">
        在后台做的修改不会立刻出现在官网上。这样您可以先慢慢改、先预览检查，确认无误后再一键发布，
        不用担心改到一半被客户看到。万一发布后发现问题，还可以一键回滚到以前的版本。
      </p>
      <el-steps :active="4" align-center finish-status="success" class="steps">
        <el-step v-for="s in flow" :key="s.title" :title="s.title" :description="s.where" />
      </el-steps>
    </section>

    <section v-for="(s, i) in flow" :key="s.title" class="page-card step-card">
      <div class="step-head">
        <span class="step-no">{{ i + 1 }}</span>
        <div class="step-text">
          <h3>{{ s.title }}</h3>
          <span class="where">位置：{{ s.where }}</span>
        </div>
        <span class="spacer" />
        <el-button v-if="s.path" size="small" @click="router.push(s.path)">前往</el-button>
      </div>
      <ol class="points">
        <li v-for="p in s.points" :key="p">{{ p }}</li>
      </ol>
    </section>

    <section class="page-card">
      <h3 class="faq-title">常见问题</h3>
      <el-collapse v-model="openFaq">
        <el-collapse-item v-for="f in faqs" :key="f.name" :name="f.name" :title="f.q">
          <p class="answer">{{ f.a }}</p>
        </el-collapse-item>
      </el-collapse>
    </section>
  </div>
</template>

<style scoped>
.guide {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 960px;
}

.title {
  margin: 0 0 8px;
  font-size: 18px;
  color: #0f172a;
}

.desc {
  margin: 0;
  color: #475569;
  line-height: 1.8;
  font-size: 14px;
}

.steps {
  margin-top: 24px;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-no {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-text h3 {
  margin: 0;
  font-size: 16px;
  color: #0f172a;
}

.where {
  font-size: 12px;
  color: #64748b;
}

.spacer {
  flex: 1;
}

.points {
  margin: 14px 0 0;
  padding-left: 64px;
  color: #334155;
  line-height: 1.9;
  font-size: 14px;
}

.faq-title {
  margin: 0 0 8px;
  font-size: 16px;
  color: #0f172a;
}

.answer {
  margin: 0;
  color: #475569;
  line-height: 1.8;
}

@media (max-width: 640px) {
  .points {
    padding-left: 20px;
  }
}
</style>
