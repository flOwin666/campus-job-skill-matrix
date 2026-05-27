<script setup>
import { ref, computed, onMounted } from 'vue'
import MatrixView from './components/MatrixView.vue'
import ListView from './components/ListView.vue'
import JobModal from './components/JobModal.vue'

// 数据初始化：动态加载
const jobs = ref([])
const lastUpdated = ref('')
const companies = {
  'bytedance': '字节跳动',
  'alibaba': '阿里巴巴',
  'tencent': '腾讯',
  'meituan': '美团',
  'baidu': '百度'
}
const companyColors = {
  '字节跳动': '#00d2ff',
  '阿里巴巴': '#ff6600',
  '腾讯': '#32b4ff',
  '美团': '#ff9100',
  '百度': '#4caf50'
}
const standardCities = ['北京', '上海', '深圳', '杭州', '广州']

// 响应式状态
const selectedCompany = ref('')
const selectedCity = ref('')
const searchQuery = ref('')
const currentView = ref('matrix')
const selectedSkills = ref({}) // { skillName: boolean }
const selectedJob = ref(null)

// ========== 设置面板 ==========
const showSettings = ref(false)
const settingsTab = ref('skills')

// ========== AI 对话 ==========
const chatMessages = ref([])
const chatInput = ref('')
const chatLoading = ref(false)
const chatEl = ref(null)

function getAdminToken() {
  return localStorage.getItem('adminToken') || ''
}

async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || chatLoading.value) return
  chatMessages.value.push({ role: 'user', content: text })
  chatInput.value = ''
  chatLoading.value = true

  // 滚动到底部
  setTimeout(() => {
    if (chatEl.value) chatEl.value.scrollTop = chatEl.value.scrollHeight
  }, 50)

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages.value })
    })

    if (!res.ok) {
      const err = await res.json()
      chatMessages.value.push({ role: 'assistant', content: `❌ ${err.error || '请求失败'}` })
      chatLoading.value = false
      return
    }

    // SSE 流式读取
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let aiMsg = { role: 'assistant', content: '' }
    chatMessages.value.push(aiMsg)

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            if (json.content) {
              aiMsg.content += json.content
            }
          } catch {}
        }
      }
    }
  } catch (e) {
    chatMessages.value.push({ role: 'assistant', content: `❌ 网络错误: ${e.message}` })
  }
  chatLoading.value = false
}

// ========== 管理员相关状态 ==========
const adminPassword = ref('')
const isAdminAuthenticated = ref(false)
const authError = ref('')
const showRefreshModal = ref(false)
const isRefreshing = ref(false)
const isRefreshPaused = ref(false)
const refreshLogs = ref([])
const refreshStatus = ref('idle') // 'idle' | 'running' | 'paused' | 'success' | 'failure'
const failuresData = ref([])      // 累积的失败日志
const showFailuresLog = ref(false) // 查看失败日志展开状态

// 失败原因英文 → 中文映射
const FAILURE_REASON_MAP = {
  timeout: '请求超时',
  empty_page: '页面内容不足',
  network_error: '网络错误',
  browser_error: '浏览器异常',
  login_required: '需要登录',
  rate_limited: '反爬拦截',
  selector_mismatch: '页面结构变化',
  unknown: '未知错误',
};

// ========== 管理员方法 ==========
async function verifyPassword() {
  authError.value = ''
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword.value })
    })
    const data = await res.json()
    if (data.success) {
      isAdminAuthenticated.value = true
      localStorage.setItem('adminToken', adminPassword.value)
      adminPassword.value = ''
      authError.value = ''
    } else {
      authError.value = data.message || '密码错误'
    }
  } catch (e) {
    authError.value = '验证失败，请检查后端服务器是否运行'
  }
}

function logoutAdmin() {
  isAdminAuthenticated.value = false
  localStorage.removeItem('adminToken')
  settingsTab.value = 'skills'
}

function openRefreshModal() {
  showRefreshModal.value = true
  refreshLogs.value = []
  refreshStatus.value = 'idle'
  isRefreshPaused.value = false
  failuresData.value = []
  showFailuresLog.value = false
  refreshData()
}

function closeRefreshModal() {
  if (isRefreshing.value) return; // 需通过 ✕ 关闭（会先停止）
  showRefreshModal.value = false
}

function forceCloseRefreshModal() {
  if (isRefreshing.value) stopRefresh();
  showRefreshModal.value = false
}

async function togglePause() {
  const res = await fetch('/api/refresh/pause', { method: 'POST' })
  const data = await res.json()
  isRefreshPaused.value = data.paused
  refreshStatus.value = data.paused ? 'paused' : 'running'
}

async function stopRefresh() {
  await fetch('/api/refresh/stop', { method: 'POST' })
  isRefreshing.value = false
  isRefreshPaused.value = false
}

// ========== 技能管理 ==========
const showSkillsModal = ref(false)
const skillSearch = ref('')
const newSkillName = ref('')
const skillMsg = ref('')
const skillErr = ref(false)
const allSkillsData = ref([])
const showDeleteSkillConfirm = ref(false)
const deleteSkillTarget = ref(null)

const filteredSkills = computed(() => {
  const q = skillSearch.value.toLowerCase()
  return allSkillsData.value.filter(s => s.name.toLowerCase().includes(q))
})

async function openSkillsModal() {
  showSkillsModal.value = true
  skillSearch.value = ''
  newSkillName.value = ''
  skillMsg.value = ''
  try {
    const res = await fetch('/api/skills')
    let list = await res.json()
    // 应用 localStorage 排序
    const order = skillOrder.value;
    if (order.length > 0) {
      const ordered = order.filter(n => list.find(s => s.name === n));
      const rest = list.filter(s => !order.includes(s.name));
      list = [...ordered.map(n => list.find(s => s.name === n)), ...rest];
    }
    allSkillsData.value = list;
  } catch (e) { console.error(e) }
}

function moveSkill(idx, dir) {
  const list = [...allSkillsData.value];
  const [item] = list.splice(idx, 1);
  list.splice(idx + dir, 0, item);
  allSkillsData.value = list;
  // 持久化顺序
  const order = list.map(s => s.name);
  saveSkillOrder(order);
}

async function addSkill() {
  const name = newSkillName.value.trim()
  if (!name) return
  try {
    const res = await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() }, body: JSON.stringify({ skill: name }) })
    const data = await res.json()
    if (res.ok) {
      allSkillsData.value.push({ name, count: 0, descCount: 0 })
      newSkillName.value = ''
      skillMsg.value = data.message || '已添加'
      skillErr.value = false
    } else {
      skillMsg.value = data.error || '添加失败'
      skillErr.value = true
    }
  } catch (e) { skillMsg.value = '网络错误'; skillErr.value = true }
}

function confirmDeleteSkill(s) {
  deleteSkillTarget.value = s
  showDeleteSkillConfirm.value = true
}

async function deleteSkill() {
  const s = deleteSkillTarget.value
  if (!s) return
  await fetch('/api/skills', { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() }, body: JSON.stringify({ skill: s.name }) })
  allSkillsData.value = allSkillsData.value.filter(x => x.name !== s.name)
  await loadJobs()
  showDeleteSkillConfirm.value = false
  deleteSkillTarget.value = null
}

// ========== 失败日志修复 ==========
const fixingJobs = ref({})
const fixingAll = ref(false)
const fixAllProgress = ref({ done: 0, total: 0 })
const showDeleteConfirm = ref(false)
const deleteTarget = ref(null)

async function fixJob(f) {
  fixingJobs.value = { ...fixingJobs.value, [f.jobId]: true }
  try {
    const res = await fetch('/api/refresh/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: f.url, company: f.company, reason: f.reason })
    })
    const data = await res.json()
    if (data.success) {
      failuresData.value = failuresData.value.filter(x => x.jobId !== f.jobId)
    } else {
      f.retryCount = data.retryCount
      if (data.unfixable) { f.unfixable = true; confirmDelete(f) }
    }
  } catch (e) { console.error(e) }
  fixingJobs.value = { ...fixingJobs.value, [f.jobId]: false }
}

async function fixAll() {
  fixingAll.value = true
  fixAllProgress.value = { done: 0, total: failuresData.value.length }
  const res = await fetch('/api/refresh/fix-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failures: failuresData.value.map(f => ({ url: f.url, company: f.company, reason: f.reason })) })
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === 'fix_progress') {
            fixAllProgress.value = { done: data.done, total: data.total, fixed: data.fixed, failed: data.failed }
          } else if (data.type === 'fix_done') {
            failuresData.value = failuresData.value.filter(f => {
              // 保留仍未修复的
              return true // 暂时保留所有，实际应标记已修复
            })
          }
        } catch {}
      }
    }
  }
  fixingAll.value = false
}

function confirmDelete(f) {
  deleteTarget.value = f
  showDeleteConfirm.value = true
}

async function deleteSeed() {
  const f = deleteTarget.value
  if (!f) return
  await fetch('/api/refresh/delete-seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: f.url })
  })
  failuresData.value = failuresData.value.filter(x => x.jobId !== f.jobId)
  showDeleteConfirm.value = false
  deleteTarget.value = null
}

function refreshData() {
  isRefreshing.value = true
  refreshLogs.value = []
  refreshStatus.value = 'running'
  
  const eventSource = new EventSource('/api/refresh')
  
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.type === 'failures_batch') {
        // 累积失败日志（按 company + jobId 去重）
        for (const f of data.failures || []) {
          if (!failuresData.value.find(x => x.jobId === f.jobId && x.company === (data.company || ''))) {
            failuresData.value.push({ ...f, company: data.company })
          }
        }
      } else if (data.type === 'start') {
        refreshLogs.value.push({ type: 'info', text: data.message })
      } else if (data.type === 'log') {
        refreshLogs.value.push({ type: 'log', text: data.message.trim() })
      } else if (data.type === 'error') {
        refreshLogs.value.push({ type: 'error', text: data.message.trim() })
      } else if (data.type === 'partial_done') {
        refreshLogs.value.push({ type: 'warning', text: data.message })
        refreshStatus.value = 'success'
        isRefreshing.value = false
        eventSource.close()
      } else if (data.type === 'success') {
        refreshLogs.value.push({ type: 'success', text: data.message })
        refreshStatus.value = 'success'
        isRefreshing.value = false
        eventSource.close()
      } else if (data.type === 'failure') {
        refreshLogs.value.push({ type: 'error', text: data.message })
        refreshStatus.value = 'failure'
        isRefreshing.value = false
        eventSource.close()
      }
    } catch (e) {
      console.error('解析SSE数据失败:', e)
    }
  }
  
  eventSource.onerror = () => {
    refreshLogs.value.push({ type: 'error', text: '连接中断，请检查网络' })
    refreshStatus.value = 'failure'
    isRefreshing.value = false
    eventSource.close()
  }
}

async function reloadData() {
  showRefreshModal.value = false
  await loadJobs()
}

// 计算属性：技能计数、全部技能列表、筛选后岗位
const skillCounts = computed(() => {
  const counts = {}
  jobs.value.forEach(job => {
    (job.skills || []).forEach(skill => {
      counts[skill] = (counts[skill] || 0) + 1
    })
  })
  return counts
})

const descSkillCounts = computed(() => {
  const counts = {}
  jobs.value.forEach(job => {
    (job.descSkills || []).forEach(skill => {
      counts[skill] = (counts[skill] || 0) + 1
    })
  })
  return counts
})

const bonusSkillCounts = computed(() => {
  const counts = {}
  jobs.value.forEach(job => {
    (job.bonusSkills || []).forEach(skill => {
      counts[skill] = (counts[skill] || 0) + 1
    })
  })
  return counts
})

// localStorage 技能排序
const skillOrder = ref(loadSkillOrder())
function loadSkillOrder() {
  try { return JSON.parse(localStorage.getItem('skillOrder') || '[]'); } catch { return []; }
}
function saveSkillOrder(order) {
  localStorage.setItem('skillOrder', JSON.stringify(order));
  skillOrder.value = order;
}

const allSkills = computed(() => {
  const merged = new Set([
    ...Object.keys(skillCounts.value),
    ...Object.keys(descSkillCounts.value),
    ...Object.keys(bonusSkillCounts.value)
  ])
  let list = [...merged];
  // 用户自定义顺序优先
  const order = skillOrder.value;
  if (order.length > 0) {
    const ordered = order.filter(s => list.includes(s));
    const rest = list.filter(s => !order.includes(s)).sort((a, b) =>
      ((skillCounts.value[b] || 0) + (descSkillCounts.value[b] || 0) + (bonusSkillCounts.value[b] || 0)) -
      ((skillCounts.value[a] || 0) + (descSkillCounts.value[a] || 0) + (bonusSkillCounts.value[a] || 0))
    );
    list = [...ordered, ...rest];
  } else {
    list.sort((a, b) =>
      ((skillCounts.value[b] || 0) + (descSkillCounts.value[b] || 0) + (bonusSkillCounts.value[b] || 0)) -
      ((skillCounts.value[a] || 0) + (descSkillCounts.value[a] || 0) + (bonusSkillCounts.value[a] || 0))
    );
  }
  // 搜索高亮置顶
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    const match = list.filter(s => s.toLowerCase().includes(q));
    const nomatch = list.filter(s => !s.toLowerCase().includes(q));
    list = [...match, ...nomatch];
  }
  return list;
})

// 当前搜索匹配的技能名
const searchMatchedSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return new Set();
  return new Set(allSkills.value.filter(s => s.toLowerCase().includes(q)));
})

const filteredJobs = computed(() => {
  return jobs.value.filter(job => {
    // 公司筛选
    if (selectedCompany.value) {
      const targetName = companies[selectedCompany.value] || selectedCompany.value
      const jobName = companies[job.company] || job.company
      if (targetName!== jobName) return false
    }
    // 城市筛选
    if (selectedCity.value && !(job.location || '').includes(selectedCity.value)) return false
    // 技能筛选（岗位的 skills 或 descSkills 任意一个包含即可）
    const selectedList = Object.keys(selectedSkills.value).filter(s => selectedSkills.value[s])
    if (selectedList.length > 0) {
      const jobSkills = new Set([...(job.skills || []), ...(job.descSkills || []), ...(job.bonusSkills || [])])
      for (const s of selectedList) {
        if (!jobSkills.has(s)) return false
      }
    }
    // 搜索筛选
    if (searchQuery.value) {
      const search = searchQuery.value.toLowerCase()
      const text = (job.title + ' ' + [...(job.skills||[]), ...(job.descSkills||[]), ...(job.bonusSkills||[])].join(' ')).toLowerCase()
      if (!text.includes(search)) return false
    }
    return true
  })
})

// 方法
function toggleSkill(skill) {
  if (!selectedSkills.value[skill]) {
    selectedSkills.value[skill] = true
  } else {
    delete selectedSkills.value[skill]
  }
  // 强制触发响应式更新
  selectedSkills.value = { ...selectedSkills.value }
}

function switchView(view) {
  currentView.value = view
}

function showDetail(job) {
  selectedJob.value = job
}

function closeModal() {
  selectedJob.value = null
}

// 动态加载数据
async function loadJobs() {
  try {
    // 优先从本地加载（开发），失败时从 GitHub 加载（生产）
    let res = await fetch('/src/jobsData.json?t=' + Date.now()).catch(() => null)
    if (!res || !res.ok) {
      console.log('[App] 本地数据不可用，从 GitHub 加载...')
      res = await fetch('https://raw.githubusercontent.com/flOwin666/campus-job-skill-matrix-data/main/jobsData.json?t=' + Date.now())
    }
    const data = await res.json()
    jobs.value = data.results || []
    lastUpdated.value = data.lastUpdated || ''
    console.log('[App] 数据加载成功，更新时间:', lastUpdated.value)
  } catch (e) {
    console.error('[App] 加载数据失败:', e)
  }
}

// 格式化时间显示
function formatTime(isoString) {
  if (!isoString) return '未知'
  const date = new Date(isoString)
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

function getRelativeTime(isoString) {
  if (!isoString) return ''
  const now = Date.now()
  const updated = new Date(isoString).getTime()
  const diffMs = now - updated
  const diffMin = Math.floor(diffMs / 60000)
  
  if (diffMin < 1) return '(刚刚)'
  if (diffMin < 60) return `(${diffMin}分钟前)`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `(${diffHr}小时前)`
  const diffDay = Math.floor(diffHr / 24)
  return `(${diffDay}天前)`
}

// 键盘 Escape 关闭弹窗
onMounted(() => {
  loadJobs()
  // 恢复管理员认证状态
  if (localStorage.getItem('adminToken')) {
    isAdminAuthenticated.value = true
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (showSettings.value) { showSettings.value = false; return }
      closeModal()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  
  // 清理事件监听器（改用 onUnmounted）
  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown)
  })
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="header">
      <h1>校招岗位技能矩阵</h1>
      <div class="subtitle">互联网大厂校招岗位技能需求分析</div>
    </div>

    <!-- Controls -->
    <div class="controls">
      <div class="filter-group">
        <label>公司</label>
        <select v-model="selectedCompany" id="companyFilter">
          <option value="">全部</option>
          <option v-for="(label, key) in companies" :key="key" :value="key">{{ label }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>城市</label>
        <select v-model="selectedCity" id="cityFilter">
          <option value="">全部</option>
          <option v-for="city in standardCities" :key="city" :value="city">{{ city }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>搜索</label>
        <input type="text" v-model="searchQuery" id="searchInput" placeholder="岗位名称或技能...">
      </div>
      <div class="view-toggle">
        <button class="btn" :class="{ active: currentView === 'matrix' }" @click="switchView('matrix')">矩阵</button>
        <button class="btn" :class="{ active: currentView === 'list' }" @click="switchView('list')">列表</button>
      </div>
      
      <!-- 更新时间显示 -->
      <div class="update-time" v-if="lastUpdated">
        {{ formatTime(lastUpdated) }} {{ getRelativeTime(lastUpdated) }}
      </div>
    </div>

    <!-- Stats Bar -->
    <div class="stats-bar">
      <div class="stat-item">
        <span class="stat-label">岗位</span>
        <span class="stat-value">{{ jobs.length }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">筛选</span>
        <span class="stat-value">{{ filteredJobs.length }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">技能</span>
        <span class="stat-value">{{ allSkills.length }}</span>
      </div>
      <div class="stat-sep"></div>
      <span class="stat-label" style="margin-right:8px;white-space:nowrap">点击技能筛选岗位 <span style="color:#34d399">●必需</span> <span style="color:#f59e0b">●加分</span> <span style="color:#1da1f2">●相关</span></span>
      <div class="skill-tags" id="skillStats">
        <span
          v-for="skill in allSkills"
          :key="skill"
          class="skill-tag"
          :class="{ active: selectedSkills[skill] }"
          @click="toggleSkill(skill)"
        >
          {{ skill }}
          <span style="color:#34d399">{{ skillCounts[skill] || 0 }}</span>
          <span v-if="bonusSkillCounts[skill]" style="color:#f59e0b">·{{ bonusSkillCounts[skill] }}</span>
          <span v-if="descSkillCounts[skill]" style="color:#1da1f2">·{{ descSkillCounts[skill] }}</span>
        </span>
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <MatrixView
        v-if="currentView === 'matrix'"
        :jobs="filteredJobs"
        :all-skills="allSkills"
        :selected-skills="selectedSkills"
        :skill-counts="skillCounts"
        :desc-skill-counts="descSkillCounts"
        :bonus-skill-counts="bonusSkillCounts"
        :search-matched-skills="searchMatchedSkills"
        :companies="companies"
        :company-colors="companyColors"
        @toggle-skill="toggleSkill"
        @show-detail="showDetail"
      />
      <ListView 
        v-if="currentView === 'list'" 
        :jobs="filteredJobs" 
        :companies="companies" 
        :company-colors="companyColors" 
        @show-detail="showDetail"
      />
    </div>

    <!-- Modal -->
    <JobModal 
      v-if="selectedJob" 
      :job="selectedJob" 
      :companies="companies" 
      :company-colors="companyColors" 
      @close="closeModal"
    />

    <!-- ========== 设置面板 ========== -->
    <!-- 齿轮按钮 -->
    <button class="gear-btn" @click="showSettings = true; settingsTab = 'skills'" title="设置">
      <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linejoin="round">
        <path d="M 38.35,19.66 L 43.39,2.96 L 56.61,2.96 L 61.65,19.66 L 63.22,20.31 L 78.59,12.06 L 87.94,21.41 L 79.69,36.78 L 80.34,38.35 L 97.04,43.39 L 97.04,56.61 L 80.34,61.65 L 79.69,63.22 L 87.94,78.59 L 78.59,87.94 L 63.22,79.69 L 61.65,80.34 L 56.61,97.04 L 43.39,97.04 L 38.35,80.34 L 36.78,79.69 L 21.41,87.94 L 12.06,78.59 L 20.31,63.22 L 19.66,61.65 L 2.96,56.61 L 2.96,43.39 L 19.66,38.35 L 20.31,36.78 L 12.06,21.41 L 21.41,12.06 L 36.78,20.31 Z"/>
        <circle cx="50" cy="50" r="13.75"/>
      </svg>
    </button>

    <!-- 设置面板浮层 -->
    <div v-if="showSettings" class="settings-overlay" @click.self="showSettings = false">
      <div class="settings-panel">
        <!-- 左侧导航 -->
        <div class="settings-sidebar">
          <div class="settings-sidebar-label">设置</div>
          <div class="settings-nav-item" :class="{ active: settingsTab === 'skills' }" @click="settingsTab = 'skills'">
            <svg class="settings-nav-icon" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            技能管理
          </div>
          <div class="settings-nav-item" :class="{ active: settingsTab === 'chat' }" @click="settingsTab = 'chat'">
            <svg class="settings-nav-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            AI 助手
          </div>
          <div class="settings-nav-divider"></div>
          <div class="settings-nav-item" :class="{ active: settingsTab === 'admin' }" @click="settingsTab = 'admin'">
            <svg class="settings-nav-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1.5" style="fill:#64b5f6;stroke:none"/></svg>
            管理员模式
          </div>
          <div v-if="isAdminAuthenticated" class="settings-nav-item" :class="{ active: settingsTab === 'refresh' }" @click="settingsTab = 'refresh'">
            <svg class="settings-nav-icon" viewBox="0 0 24 24"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10"/><path d="M3.51 15A9 9 0 0018.36 18.36L23 14"/></svg>
            数据刷新
          </div>
        </div>
        <!-- 右侧内容 -->
        <div class="settings-body">
          <button class="settings-close" @click="showSettings = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>

          <!-- 技能管理页 -->
          <div v-if="settingsTab === 'skills'" class="settings-content skills-content">
            <h4>技能管理</h4>
            <p class="settings-desc">管理岗位技能列表，调整排序与新增删除</p>
            <button class="btn-primary" @click="showSettings = false; openSkillsModal()">打开技能管理</button>
          </div>

          <!-- AI 助手页 -->
          <div v-if="settingsTab === 'chat'" class="settings-chat">
            <div class="chat-messages" ref="chatEl">
              <div v-if="chatMessages.length === 0" class="chat-empty">
                <p>👋 你好！我是校招岗位助手</p>
                <p class="settings-desc">可以问我岗位要求、技能分析、求职建议等</p>
              </div>
              <div v-for="(m, i) in chatMessages" :key="i" class="chat-msg" :class="m.role">
                <div class="chat-msg-bubble">{{ m.content }}</div>
              </div>
              <div v-if="chatLoading" class="chat-msg assistant">
                <div class="chat-msg-bubble chat-typing">...</div>
              </div>
            </div>
            <div class="chat-input-row">
              <input v-model="chatInput" class="chat-input" placeholder="输入你的问题..."
                @keyup.enter="sendMessage" :disabled="chatLoading" />
              <button class="chat-send" @click="sendMessage" :disabled="chatLoading || !chatInput.trim()">发送</button>
            </div>
          </div>

          <!-- 管理员模式页 -->
          <div v-if="settingsTab === 'admin'" class="settings-content">
            <template v-if="!isAdminAuthenticated">
              <h4>管理员验证</h4>
              <p class="settings-desc">输入密码解锁数据刷新功能</p>
              <input type="password" v-model="adminPassword" placeholder="请输入密码" class="settings-input" @keyup.enter="verifyPassword" />
              <button class="btn-primary" @click="verifyPassword">确认</button>
              <p v-if="authError" class="error-msg">{{ authError }}</p>
            </template>
            <template v-else>
              <div class="auth-success-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <h4 style="color:#4caf50">已进入管理员模式</h4>
              <p class="settings-desc">可在左侧导航使用数据刷新功能</p>
              <button class="btn-secondary" @click="logoutAdmin">退出管理员模式</button>
            </template>
          </div>

          <!-- 数据刷新页 -->
          <div v-if="settingsTab === 'refresh'" class="settings-content">
            <h4>数据刷新</h4>
            <p class="settings-desc">重新爬取所有公司的岗位数据</p>
            <button class="btn-primary" style="background:#4caf50" @click="showSettings = false; openRefreshModal()">开始数据刷新</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除种子确认弹窗 -->
    <div v-if="showDeleteConfirm" class="modal-overlay active">
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3>确认删除</h3></div>
        <div class="modal-body">
          <p v-if="deleteTarget?.unfixable" style="color:#ffb74d;margin-bottom:12px">
            自动修复失败（原因：{{ FAILURE_REASON_MAP[deleteTarget?.reason] || deleteTarget?.reason }}）。该岗位可能已下架。是否从数据库删除？
          </p>
          <p v-else style="color:#c5cdd3;margin-bottom:12px">
            删除种子数据后无法恢复，会影响后续爬取。确认删除？
          </p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showDeleteConfirm = false">取消</button>
            <button class="btn-confirm" style="background:#e74c3c" @click="deleteSeed">确认删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 技能管理模态框 -->
    <div v-if="showSkillsModal" class="modal-overlay active" @click.self="showSkillsModal = false">
      <div class="modal" style="max-width:650px">
        <div class="modal-header">
          <h3>技能管理（共 {{ filteredSkills.length }} 个）</h3>
          <button class="modal-close" @click="showSkillsModal = false">✕</button>
        </div>
        <div class="modal-body">
          <!-- 搜索 -->
          <input v-model="skillSearch" placeholder="🔍 搜索技能..." class="skill-search-input" />

          <!-- 技能标签云 -->
          <div class="skill-cloud">
            <span v-for="(s, idx) in filteredSkills" :key="s.name" class="skill-cloud-tag" :class="{ 'zero-count': s.count === 0 }">
              <span class="skill-order-btns">
                <button class="skill-order-btn" :disabled="idx === 0" @click="moveSkill(idx, -1)" title="前移">▲</button>
                <button class="skill-order-btn" :disabled="idx === filteredSkills.length - 1" @click="moveSkill(idx, 1)" title="后移">▼</button>
              </span>
              {{ s.name }} <span class="skill-count">{{ s.count }}</span>
              <button class="skill-delete-btn" @click="confirmDeleteSkill(s)" title="删除">✕</button>
            </span>
          </div>

          <!-- 新增 -->
          <div class="skill-add-row">
            <input v-model="newSkillName" placeholder="输入新技能名称" class="skill-add-input"
              @keyup.enter="addSkill" />
            <button class="btn-confirm" @click="addSkill" :disabled="!newSkillName.trim()">确认添加</button>
          </div>
          <p class="skill-hint">新技能下次刷新数据后生效</p>
          <p v-if="skillMsg" class="skill-msg" :class="{ 'skill-err': skillErr }">{{ skillMsg }}</p>
        </div>
      </div>
    </div>

    <!-- 删除技能确认 -->
    <div v-if="showDeleteSkillConfirm" class="modal-overlay active">
      <div class="modal" style="max-width:400px">
        <div class="modal-header"><h3>确认删除</h3></div>
        <div class="modal-body">
          <p style="color:#c5cdd3;margin-bottom:12px">删除技能 "{{ deleteSkillTarget?.name }}" 后，矩阵中该列将移除。确认删除？</p>
          <div class="modal-actions">
            <button class="btn-cancel" @click="showDeleteSkillConfirm = false">取消</button>
            <button class="btn-confirm" style="background:#e74c3c" @click="deleteSkill">确认删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 数据刷新进度模态框 -->
    <div v-if="showRefreshModal" class="modal-overlay" @click.self="closeRefreshModal">
      <div class="modal refresh-modal">
        <div class="modal-header">
          <h3>数据刷新</h3>
          <button class="modal-close" @click="forceCloseRefreshModal" title="关闭刷新">✕</button>
        </div>

        <!-- 暂停/继续按钮 -->
        <div class="refresh-actions" v-if="isRefreshing">
          <button class="btn-pause" @click="togglePause">
            <span class="btn-pause-icon">{{ isRefreshPaused ? '▶' : '⏸' }}</span>
            <span>{{ isRefreshPaused ? '继续刷新' : '暂停刷新' }}</span>
          </button>
        </div>

        <!-- 进度显示 -->
        <div class="refresh-progress" v-if="isRefreshing">
          <div class="spinner" v-if="!isRefreshPaused"></div>
          <p v-if="!isRefreshPaused">正在刷新数据，请稍候...</p>
          <p v-else style="color:#ffb74d">刷新已暂停</p>
        </div>
        
        <!-- 结果显示 -->
        <div class="refresh-result" v-if="refreshStatus === 'success'">
          <p class="success-text">✅ 数据刷新成功！</p>
          <button class="btn-confirm" @click="reloadData">重新加载数据</button>

          <!-- 失败日志 -->
          <div class="failures-section" v-if="failuresData.length > 0">
            <button class="btn-failures-toggle" @click="showFailuresLog = !showFailuresLog">
              {{ showFailuresLog ? '收起失败日志 ▲' : `查看失败日志 (${failuresData.length}) ▼` }}
            </button>
            <div class="failures-panel" v-if="showFailuresLog">
              <div
                v-for="f in failuresData"
                :key="f.jobId"
                class="failure-row"
                :class="{ 'repeated-failure': f.consecutiveFails >= 3 }"
              >
                <span class="failure-company">{{ companies[f.company] || f.company }}</span>
                <span class="failure-title">⚠️ {{ f.title }}</span>
                <span class="failure-reason">{{ FAILURE_REASON_MAP[f.reason] || f.reason }}</span>
                <span class="failure-consecutive" v-if="f.consecutiveFails >= 3">连续 {{ f.consecutiveFails }} 次</span>
                <a class="failure-url" :href="f.url" target="_blank" :title="f.url">{{ (f.url || '').substring(0, 40) }}...</a>
                <button
                  v-if="f.reason !== 'login_required' && !f.unfixable"
                  class="btn-fix"
                  :disabled="fixingJobs[f.jobId]"
                  @click="fixJob(f)"
                >{{ fixingJobs[f.jobId] ? '修复中...' : '修复' }}</button>
                <button class="btn-delete-seed" @click="confirmDelete(f)" title="删除种子数据">✕</button>
              </div>
              <div class="fix-all-row" v-if="failuresData.length > 1 && showFailuresLog">
                <button class="btn-fix-all" @click="fixAll" :disabled="fixingAll">
                  {{ fixingAll ? `修复中 ${fixAllProgress.done}/${fixAllProgress.total}...` : `全部修复 (${failuresData.length})` }}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="refresh-result" v-if="refreshStatus === 'failure'">
          <p class="error-text">❌ 数据刷新失败</p>
          <button class="btn-cancel" @click="closeRefreshModal">关闭</button>
        </div>
        
        <!-- 日志输出 -->
        <div class="log-container" v-if="refreshLogs.length > 0">
          <div 
            v-for="(log, index) in refreshLogs" 
            :key="index" 
            class="log-line"
            :class="'log-' + log.type"
          >
            {{ log.text }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 设置面板样式 ========== */
.gear-btn {
  position: fixed;
  bottom: 22px;
  right: 22px;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.28);
  transition: color 0.25s, transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 90;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.gear-btn:hover {
  color: rgba(255, 255, 255, 0.65);
  transform: rotate(50deg);
}
.gear-btn svg { width: 30px; height: 30px; }

.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-panel {
  width: 60%;
  max-width: 720px;
  height: 62%;
  max-height: 520px;
  background: #14181c;
  border-radius: 14px;
  border: 1px solid #23262a;
  display: flex;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.settings-sidebar {
  width: 170px;
  min-width: 170px;
  background: #181d22;
  border-right: 1px solid #1f2328;
  padding: 22px 0 18px;
  display: flex;
  flex-direction: column;
}
.settings-sidebar-label {
  padding: 0 18px;
  margin-bottom: 16px;
  font-size: 15px;
  color: #9aa0a8;
  letter-spacing: 0.5px;
  font-weight: 600;
}
.settings-nav-item {
  padding: 11px 18px;
  font-size: 13.5px;
  color: #7a8088;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  border-left: 3px solid transparent;
  transition: all 0.18s;
  user-select: none;
}
.settings-nav-item:hover {
  color: #b0b8c0;
  background: rgba(255, 255, 255, 0.02);
}
.settings-nav-item.active {
  color: #d8dce0;
  border-left-color: #1da1f2;
  background: rgba(29, 161, 242, 0.07);
}
.settings-nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  stroke: #64b5f6;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.settings-nav-divider {
  margin: 14px 12px;
  border-top: 1px solid #1f2328;
}
.settings-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
}
.settings-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.22);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s;
  z-index: 1;
}
.settings-close:hover {
  color: rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.06);
}
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 36px 28px;
  text-align: center;
}
.settings-content h4 {
  font-size: 16px;
  color: #e0e0e0;
  margin-bottom: 6px;
  font-weight: 500;
}
.settings-desc {
  font-size: 12.5px;
  color: #555;
  margin-bottom: 20px;
}
.settings-input {
  width: 220px;
  padding: 9px 14px;
  background: #0f1419;
  border: 1px solid #2a2d31;
  border-radius: 7px;
  color: #e0e0e0;
  font-size: 13px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s;
}
.settings-input:focus { border-color: #1da1f2; }
.btn-primary {
  margin-top: 12px;
  padding: 8px 32px;
  background: #1da1f2;
  border: none;
  border-radius: 7px;
  color: white;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover { background: #1a91dc; }
.error-msg {
  margin-top: 10px;
  font-size: 11.5px;
  color: #e74c3c;
  min-height: 18px;
}
.btn-secondary {
  margin-top: 8px;
  padding: 7px 20px;
  background: transparent;
  border: 1px solid #3a3d41;
  border-radius: 6px;
  color: #888;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-secondary:hover { color: #bbb; border-color: #555; }
.auth-success-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(76, 175, 80, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

/* ========== AI 对话样式 ========== */
.settings-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #555;
  text-align: center;
}
.chat-empty p:first-child { font-size: 15px; color: #888; margin-bottom: 4px; }
.chat-msg { display: flex; max-width: 85%; }
.chat-msg.user { align-self: flex-end; }
.chat-msg.assistant { align-self: flex-start; }
.chat-msg-bubble {
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
}
.chat-msg.user .chat-msg-bubble {
  background: #1da1f2;
  color: white;
  border-bottom-right-radius: 4px;
}
.chat-msg.assistant .chat-msg-bubble {
  background: #1e2328;
  color: #d0d4d8;
  border-bottom-left-radius: 4px;
  border: 1px solid #2a2d31;
}
.chat-typing { color: #555 !important; font-style: italic; }
.chat-input-row {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #1f2328;
  background: #111418;
}
.chat-input {
  flex: 1;
  padding: 9px 12px;
  background: #0f1419;
  border: 1px solid #2a2d31;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.chat-input:focus { border-color: #1da1f2; }
.chat-input:disabled { opacity: 0.4; }
.chat-send {
  padding: 9px 18px;
  background: #1da1f2;
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}
.chat-send:hover { background: #1a91dc; }
.chat-send:disabled { background: #2a2d31; color: #555; cursor: not-allowed; }

/* 模态框样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 24px;
  min-width: 320px;
  max-width: 600px;
  max-height: 80vh;
  overflow: auto;
}

.modal h3 {
  margin: 0 0 20px 0;
  color: white;
  font-size: 18px;
  font-weight: 500;
}

.modal input[type="password"] {
  width: 100%;
  padding: 12px 16px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.modal input[type="password"]:focus {
  border-color: #4caf50;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  justify-content: flex-end;
}

.btn-cancel {
  padding: 10px 20px;
  background: #333;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: #444;
}

.btn-confirm {
  padding: 10px 20px;
  background: #4caf50;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.btn-confirm:hover {
  background: #45a049;
}

.error-text {
  color: #ff6b6b;
  font-size: 13px;
  margin-top: 12px;
  text-align: center;
}

.success-text {
  color: #4caf50;
  font-size: 16px;
  margin-bottom: 16px;
  text-align: center;
}

/* 刷新模态框样式 */
.refresh-modal {
  width: 500px;
}

.refresh-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: #4caf50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.refresh-progress p {
  color: rgba(255, 255, 255, 0.7);
  margin-top: 16px;
  font-size: 14px;
}

.refresh-result {
  text-align: center;
  padding: 20px 0;
}

.refresh-result .btn-cancel,
.refresh-result .btn-confirm {
  margin-top: 16px;
}

.log-container {
  margin-top: 16px;
  background: #0d0d1a;
  border-radius: 8px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.log-line {
  padding: 4px 0;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line:last-child {
  border-bottom: none;
}

.log-info {
  color: #4fc3f7;
}

.log-success {
  color: #4caf50;
  font-weight: 500;
}

.log-error {
  color: #ff6b6b;
}

.log-warning {
  color: #ffb74d;
}

/* ========== 失败日志面板样式 ========== */
.failures-section {
  margin-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
}

.btn-failures-toggle {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ffb74d;
  font-size: 13px;
  cursor: pointer;
  padding: 8px 16px;
  transition: all 0.2s;
  width: 100%;
  text-align: center;
}

.btn-failures-toggle:hover {
  background: rgba(255, 183, 77, 0.08);
  border-color: rgba(255, 183, 77, 0.3);
}

.failures-panel {
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 8px;
  max-height: 260px;
  overflow-y: auto;
}

.failure-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
  border-radius: 4px;
}

.failure-row:last-child {
  border-bottom: none;
}

.failure-row.repeated-failure {
  background: rgba(231, 76, 60, 0.12);
  border-left: 3px solid #e74c3c;
}

.failure-company {
  color: #8899a6;
  background: rgba(255,255,255,0.06);
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
}
.failure-title {
  color: #fff;
  font-weight: 500;
  flex: 1 1 auto;
  min-width: 120px;
}

.failure-reason {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.12);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  white-space: nowrap;
}

.failure-consecutive {
  color: #e74c3c;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.failure-url {
  color: #8899a6;
  font-size: 11px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.failure-url:hover { color: #1da1f2; }

.btn-fix {
  padding: 3px 10px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(29,161,242,0.1); color: #1da1f2;
  font-size: 12px; cursor: pointer; white-space: nowrap;
  transition: all 0.2s;
}
.btn-fix:hover { background: rgba(29,161,242,0.2); }
.btn-fix:disabled { opacity: 0.4; cursor: default; }

.btn-delete-seed {
  padding: 2px 6px; border-radius: 4px; border: none;
  background: none; color: #667; font-size: 12px;
  cursor: pointer; opacity: 0.5; transition: all 0.15s;
}
.btn-delete-seed:hover { color: #e74c3c; opacity: 1; background: rgba(231,76,60,0.08); }

.fix-all-row { padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
.btn-fix-all {
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid rgba(255,183,77,0.15);
  background: rgba(255,183,77,0.06); color: #ffb74d;
  font-size: 13px; cursor: pointer; width: 100%; transition: all 0.2s;
}
.btn-fix-all:hover { background: rgba(255,183,77,0.12); }
.btn-fix-all:disabled { opacity: 0.5; cursor: default; }

.btn-skills {
  padding: 8px 16px; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1); color: #c5cdd3;
  border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.btn-skills:hover { background: rgba(255,255,255,0.1); color: #fff; }

.skill-search-input {
  width: 100%; padding: 8px 12px; margin-bottom: 16px;
  background: #0f1419; border: 1px solid #2f3336; border-radius: 8px;
  color: #e7e9ea; font-size: 14px; outline: none;
}
.skill-search-input:focus { border-color: #1d9bf0; }

.skill-cloud { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; max-height: 300px; overflow-y: auto; }
.skill-cloud-tag {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 5px 10px; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  color: #c5cdd3; font-size: 13px;
}
.skill-cloud-tag.zero-count { color: #555; }
.skill-count { color: #1d9bf0; font-size: 11px; font-weight: 600; }
.zero-count .skill-count { color: #444; }
.skill-delete-btn {
  margin-left: 2px; padding: 0 4px; border: none; background: none;
  color: #555; font-size: 11px; cursor: pointer;
}
.skill-delete-btn:hover { color: #e74c3c; background: rgba(231,76,60,0.1); }
.skill-order-btns { display: flex; flex-direction: column; gap: 0; line-height: 1; }
.skill-order-btn {
  padding: 0 3px; border: none; background: none;
  color: #444; font-size: 8px; cursor: pointer; line-height: 1.2;
}
.skill-order-btn:hover { color: #1d9bf0; }
.skill-order-btn:disabled { color: #222; cursor: default; }
.skill-add-row { display: flex; gap: 8px; }
.skill-add-input {
  flex: 1; padding: 8px 12px; background: #0f1419;
  border: 1px solid #2f3336; border-radius: 8px;
  color: #e7e9ea; font-size: 14px; outline: none;
}
.skill-add-input:focus { border-color: #34d399; }
.skill-hint { color: #667; font-size: 12px; margin-top: 8px; }
.skill-msg { color: #34d399; font-size: 13px; margin-top: 4px; }
.skill-err { color: #e74c3c; }
</style>
