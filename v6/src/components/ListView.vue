<script setup>
import { ref } from 'vue'

const props = defineProps({
  jobs: Array,
  companies: Object,
  companyColors: Object
})

const emit = defineEmits(['showDetail'])

// 控制 JD 展开状态：用 job.url 作为唯一 key
const expandedJobs = ref({})

function toggleJd(job) {
  const key = job.url || job.title
  expandedJobs.value[key] = !expandedJobs.value[key]
  // 强制触发响应式
  expandedJobs.value = { ...expandedJobs.value }
}
</script>

<template>
  <div class="list-view">
    <div 
      v-for="job in jobs" 
      :key="job.url || job.title" 
      class="job-card"
    >
      <div class="job-card-header">
        <div>
          <span 
            class="company-badge"
            :style="{
              background: (companyColors[companies[job.company]] || '#666') + '20',
              color: (companyColors[companies[job.company]] || '#666')
            }"
          >
            {{ companies[job.company] || job.company }}
          </span>
          <span 
            class="job-card-title"
            @click="emit('showDetail', job)"
          >
            {{ job.title }}
          </span>
          <div class="job-card-meta">
            {{ job.location || '未知' }}
          </div>
        </div>
      </div>
      
      <!-- 技能标签 -->
      <div v-if="job.skills && job.skills.length" class="job-card-skills">
        <span 
          v-for="skill in job.skills" 
          :key="skill" 
          class="job-card-skill"
        >
          {{ skill }}
        </span>
      </div>
      
      <!-- JD 摘要/展开 -->
      <div 
        v-if="job.jdText"
        class="job-card-jd"
        :class="{ expanded: expandedJobs[(job.url || job.title)] }"
        @click="toggleJd(job)"
      >
        {{ expandedJobs[(job.url || job.title)] 
          ? job.jdText 
          : job.jdText.slice(0, 200) + (job.jdText.length > 200 ? '...' : '') 
        }}
      </div>
    </div>
  </div>
</template>
