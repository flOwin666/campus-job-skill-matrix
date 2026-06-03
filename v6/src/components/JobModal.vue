<script setup>
import { onMounted, onUnmounted } from 'vue'

const props = defineProps({
  job: Object,
  companies: Object,
  companyColors: Object
})

const emit = defineEmits(['close', 'analyze', 'mindmap'])

// Escape 键关闭弹窗
const handleKeyDown = (e) => {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div 
    class="modal-overlay active" 
    @click.self="$emit('close')"
  >
    <div class="modal">
      <!-- 弹窗头部 -->
      <div class="modal-header">
        <div>
          <div class="modal-title">{{ job.title }}</div>
          <div style="color:#8899a6;font-size:13px;margin-top:4px">
            <span 
              style="padding:2px 8px;border-radius:4px;margin-right:8px"
              :style="{
                background: (companyColors[companies[job.company]] || '#666') + '20',
                color: (companyColors[companies[job.company]] || '#666')
              }"
            >
              {{ companies[job.company] || job.company }}
            </span>
            {{ job.location || '未知' }}
          </div>
        </div>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>

      <!-- 弹窗内容 -->
      <div class="modal-body">
        <!-- 技能标签 -->
        <div class="modal-section">
          <div class="modal-section-title">技能标签</div>
          <div class="modal-skills">
            <span 
              v-for="skill in job.skills || []" 
              :key="skill" 
              class="modal-skill"
            >
              {{ skill }}
            </span>
          </div>
        </div>

        <!-- 职位描述 -->
        <div class="modal-section">
          <div class="modal-section-title">职位描述</div>
          <div 
            class="modal-section-content" 
            v-html="(job.jdText || '暂无职位描述').replace(/\n/g, '<br>')"
          ></div>
        </div>

        <!-- 申请链接 + 学习路线 -->
        <div class="modal-section">
          <div class="modal-section-title">申请链接</div>
          <div class="modal-bottom-row">
            <a
              class="modal-link"
              :href="job.url"
              target="_blank"
            >
              查看原职位页面 &rarr;
            </a>
            <button class="analyze-btn" @click="$emit('analyze', job)">
              <span class="analyze-icon">🧠</span>
              分析学习路线
            </button>
            <button class="mindmap-btn" @click="$emit('mindmap', job)">
              <span class="analyze-icon">🗺️</span>
              生成思维导图
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
