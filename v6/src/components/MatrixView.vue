<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const props = defineProps({
  jobs: Array,
  allSkills: Array,
  selectedSkills: Object,
  skillCounts: Object,
  descSkillCounts: Object,
  bonusSkillCounts: Object,
  searchMatchedSkills: Set,
  companies: Object,
  companyColors: Object
})

const emit = defineEmits(['toggleSkill', 'showDetail'])

const matrixScroll = ref(null)
const topScroll = ref(null)
let thumb = null
let dragging = false
let startX = 0
let startScrollLeft = 0

// Hover 预览相关状态
const previewJob = ref(null)
const previewPosition = ref({ top: 0, left: 0 })
const previewAbove = ref(false)
let hoverTimeout = null

// JD 摘要计算（100字内）
function getJdSummary(jdText, maxLength = 100) {
  if (!jdText) return '暂无描述'
  // 移除可能的 HTML 标签和多余空白
  const cleanText = jdText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (cleanText.length <= maxLength) return cleanText
  return cleanText.substring(0, maxLength) + '...'
}

// 相对时间计算
function timeAgo(timestamp) {
  if (!timestamp) return '未知'
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨天'
  return `${days} 天前`
}

// 计算预览浮层位置
function calculatePreviewPosition(event, job) {
  const cell = event.currentTarget
  const rect = cell.getBoundingClientRect()
  const viewportHeight = window.innerHeight
  const previewHeight = 280 // 预估浮层高度
  
  // 判断下方空间是否足够
  const spaceBelow = viewportHeight - rect.bottom
  const showAbove = spaceBelow < previewHeight
  
  previewAbove.value = showAbove
  
  if (showAbove) {
    // 显示在上方
    previewPosition.value = {
      bottom: viewportHeight - rect.top + 8,
      left: rect.left
    }
  } else {
    // 显示在下方
    previewPosition.value = {
      top: rect.bottom + 8,
      left: rect.left
    }
  }
}

// 鼠标进入岗位单元格
function handleMouseEnter(event, job) {
  // 清除之前的定时器
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
  }
  
  // 延迟 300ms 显示预览
  hoverTimeout = setTimeout(() => {
    calculatePreviewPosition(event, job)
    previewJob.value = job
  }, 300)
}

// 鼠标离开岗位单元格
function handleMouseLeave() {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
}

// 鼠标进入预览浮层（保持显示）
function handlePreviewEnter() {
  if (hoverTimeout) {
    clearTimeout(hoverTimeout)
    hoverTimeout = null
  }
}

// 鼠标离开预览浮层（关闭）
function handlePreviewLeave() {
  previewJob.value = null
}

// 点击页面其他地方关闭预览
function handleGlobalClick(event) {
  // 如果点击的不是预览浮层或岗位单元格，关闭预览
  if (previewJob.value) {
    const preview = document.querySelector('.job-preview-popup')
    if (preview && !preview.contains(event.target)) {
      previewJob.value = null
    }
  }
}

function updateThumb() {
  if (!matrixScroll.value || !topScroll.value) return
  const table = matrixScroll.value.querySelector('table')
  if (!table) return
  
  const totalW = table.offsetWidth
  const viewW = matrixScroll.value.clientWidth
  
  if (totalW <= viewW) {
    if (thumb) thumb.style.display = 'none'
    return
  }
  
  if (thumb) thumb.style.display = 'block'
  const ratio = viewW / totalW
  const thumbW = Math.max(40, ratio * viewW)
  const maxLeft = viewW - thumbW
  const left = matrixScroll.value.scrollLeft * (maxLeft / (totalW - viewW))
  
  if (!Number.isFinite(left)) return
  
  thumb.style.width = thumbW + 'px'
  thumb.style.left = left + 'px'
}

onMounted(() => {
  if (!matrixScroll.value || !topScroll.value) return
  
  // 创建顶部滚动条滑块
  thumb = document.createElement('div')
  thumb.id = 'topScrollThumb'
  thumb.style.cssText = 'position:absolute;height:10px;background:#2f3336;border-radius:5px;cursor:grab;z-index:10;transition:none;'
  topScroll.value.style.position = 'relative'
  topScroll.value.appendChild(thumb)
  
  // 矩阵滚动时同步更新顶部滚动条
  matrixScroll.value.addEventListener('scroll', updateThumb)
  
  // 添加全局点击事件监听（关闭预览浮层）
  document.addEventListener('click', handleGlobalClick)
  
  // 拖动滑块控制矩阵横向滚动
  const handleMouseDown = (e) => {
    dragging = true
    startX = e.clientX
    startScrollLeft = matrixScroll.value.scrollLeft
    thumb.style.cursor = 'grabbing'
    e.preventDefault()
    e.stopPropagation()
  }
  
  const handleMouseMove = (e) => {
    if (!dragging) return
    const table = matrixScroll.value.querySelector('table')
    if (!table) return
    
    const dx = e.clientX - startX
    const viewW = matrixScroll.value.clientWidth
    const totalW = table.offsetWidth
    const thumbW = Math.max(40, (viewW / totalW) * viewW)
    const maxScroll = totalW - viewW
    
    if (maxScroll <= 0) return
    
    const pxPerScroll = (viewW - thumbW) / maxScroll
    if (!Number.isFinite(pxPerScroll) || pxPerScroll === 0) return
    
    matrixScroll.value.scrollLeft = startScrollLeft + dx / pxPerScroll
  }
  
  const handleMouseUp = () => {
    if (dragging) {
      dragging = false
      if (thumb) thumb.style.cursor = 'grab'
    }
  }
  
  if (thumb) thumb.addEventListener('mousedown', handleMouseDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
  
  // 点击顶部滚动条轨道跳转
  const handleTrackClick = (e) => {
    if (e.target === thumb) return
    const rect = topScroll.value.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const viewW = matrixScroll.value.clientWidth
    const table = matrixScroll.value.querySelector('table')
    if (!table) return
    
    const totalW = table.offsetWidth
    const ratio = clickX / viewW
    matrixScroll.value.scrollLeft = ratio * (totalW - viewW)
    updateThumb()
  }
  
  topScroll.value.addEventListener('click', handleTrackClick)
  
  // 初始化滑块位置和宽度
  requestAnimationFrame(() => {
    const table = matrixScroll.value.querySelector('table')
    if (table) {
      topScroll.value.style.width = table.offsetWidth + 'px'
      updateThumb()
    }
  })
  
  window.addEventListener('resize', updateThumb)
  
  // 清理函数
  onUnmounted(() => {
    if (matrixScroll.value) {
      matrixScroll.value.removeEventListener('scroll', updateThumb)
    }
    if (thumb) {
      thumb.removeEventListener('mousedown', handleMouseDown)
    }
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.removeEventListener('click', handleGlobalClick)
    if (topScroll.value) {
      topScroll.value.removeEventListener('click', handleTrackClick)
    }
    window.removeEventListener('resize', updateThumb)
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
    }
    if (topScroll.value && thumb) {
      try {
        topScroll.value.removeChild(thumb)
      } catch (e) {
        // 忽略已删除的错误
      }
      thumb = null
    }
  })
})
</script>

<template>
  <div class="matrix-view">
    <!-- 顶部横向滚动控制栏 -->
    <div 
      ref="topScroll" 
      id="topScroll"
      style="flex-shrink:0;overflow-x:scroll;overflow-y:hidden;height:14px;background:#0f1419;cursor:pointer;border-radius:4px;-ms-overflow-style:none;scrollbar-width:none"
    ></div>
    
    <!-- 矩阵表格区域 -->
    <div ref="matrixScroll" class="matrix-scroll" id="matrixScroll" style="flex:1;overflow-x:auto;overflow-y:auto;background:#0f1419">
      <table>
        <thead>
          <tr>
            <th>岗位 / 公司</th>
            <th 
              v-for="skill in allSkills" 
              :key="skill" 
              class="skill-col" 
              :class="{ active: selectedSkills[skill], 'search-highlight': searchMatchedSkills && searchMatchedSkills.has(skill) }"
              @click="emit('toggleSkill', skill)"
            >
              {{ skill }}<br>
              <span style="font-size:10px;color:#8899a6">{{ skillCounts[skill] }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="job in jobs" :key="job.url || job.title">
            <td
              @mouseenter="handleMouseEnter($event, job)"
              @mouseleave="handleMouseLeave"
            >
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
                class="job-title" 
                @click="emit('showDetail', job)"
              >
                {{ job.title }}
              </span>
              <div style="color:#8899a6;font-size:12px;margin-top:4px">
                {{ job.location || '未知' }}
              </div>
            </td>
            <td
              v-for="skill in allSkills"
              :key="skill"
              class="skill-cell"
              :class="{
                required: (job.skills || []).includes(skill),
                bonus: !(job.skills || []).includes(skill) && (job.bonusSkills || []).includes(skill),
                desc: !(job.skills || []).includes(skill) && !(job.bonusSkills || []).includes(skill) && (job.descSkills || []).includes(skill),
                empty: !(job.skills || []).includes(skill) && !(job.bonusSkills || []).includes(skill) && !(job.descSkills || []).includes(skill),
                highlight: selectedSkills[skill] && ((job.skills || []).includes(skill) || (job.descSkills || []).includes(skill) || (job.bonusSkills || []).includes(skill))
              }"
            >
              {{ (job.skills || []).includes(skill) ? '●' : (job.bonusSkills || []).includes(skill) ? '●' : (job.descSkills || []).includes(skill) ? '●' : '○' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Hover 预览浮层 -->
    <div 
      v-if="previewJob"
      class="job-preview-popup"
      :class="{ 'preview-above': previewAbove }"
      :style="previewAbove ? { bottom: previewPosition.bottom + 'px', left: previewPosition.left + 'px' } : { top: previewPosition.top + 'px', left: previewPosition.left + 'px' }"
      @mouseenter="handlePreviewEnter"
      @mouseleave="handlePreviewLeave"
    >
      <div class="preview-header">
        <div class="preview-title">{{ previewJob.title }}</div>
        <span 
          class="preview-company"
          :style="{
            background: (companyColors[companies[previewJob.company]] || '#666') + '20',
            color: (companyColors[companies[previewJob.company]] || '#666')
          }"
        >
          {{ companies[previewJob.company] || previewJob.company }}
        </span>
      </div>
      
      <div class="preview-meta">
        <span class="preview-location">📍 {{ previewJob.location || '未知' }}</span>
        <span class="preview-time">🕐 {{ timeAgo(previewJob.updatedAt) }}</span>
      </div>
      
      <div class="preview-summary">
        {{ getJdSummary(previewJob.jdText, 120) }}
      </div>
      
      <div class="preview-skills" v-if="previewJob.skills && previewJob.skills.length">
        <span 
          v-for="skill in previewJob.skills" 
          :key="skill"
          class="skill-tag"
        >
          {{ skill }}
        </span>
      </div>
      
      <div class="preview-footer">
        <a 
          :href="previewJob.url" 
          target="_blank" 
          class="preview-link"
          @click.stop
        >
          查看原招聘页 →
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-preview-popup {
  position: fixed;
  z-index: 1000;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: #192734;
  border: 1px solid #38444d;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  animation: fadeIn 0.2s ease;
  pointer-events: auto;
}

.preview-above {
  animation: fadeInUp 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.preview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  line-height: 1.4;
  flex: 1;
}

.preview-company {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  white-space: nowrap;
}

.preview-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #8899a6;
}

.preview-summary {
  font-size: 13px;
  line-height: 1.6;
  color: #c5cdd3;
  margin-bottom: 12px;
  max-height: 80px;
  overflow-y: auto;
}

.preview-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.skill-tag {
  font-size: 11px;
  padding: 3px 8px;
  background: rgba(29, 161, 242, 0.1);
  color: #1da1f2;
  border-radius: 4px;
}

.preview-footer {
  border-top: 1px solid #38444d;
  padding-top: 12px;
  margin-top: 4px;
}

.preview-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #1da1f2;
  text-decoration: none;
  font-size: 13px;
  transition: color 0.2s;
}

.preview-link:hover {
  color: #1a91da;
  text-decoration: underline;
}
</style>
