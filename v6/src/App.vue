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

// ========== 管理员相关状态 ==========
const showPasswordModal = ref(false)
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
      showPasswordModal.value = false
      adminPassword.value = ''
    } else {
      authError.value = data.message || '密码错误'
    }
  } catch (e) {
    authError.value = '验证失败，请检查后端服务器是否运行'
  }
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
    const res = await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skill: name }) })
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
  await fetch('/api/skills', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skill: s.name }) })
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
  
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
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

    <!-- ========== 管理员面板 ========== -->
    <div class="admin-panel">
      <!-- 未认证：显示管理员入口按钮 -->
      <button 
        v-if="!isAdminAuthenticated" 
        class="btn-admin" 
        @click="showPasswordModal = true"
      >
        管理员入口
      </button>
      
      <!-- 已认证：显示刷新按钮 -->
      <div v-if="isAdminAuthenticated" class="admin-controls">
        <button class="btn-refresh" @click="openRefreshModal">数据刷新</button>
        <button class="btn-skills" @click="openSkillsModal">技能管理</button>
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

    <!-- 密码输入模态框 -->
    <div v-if="showPasswordModal" class="modal-overlay" @click.self="showPasswordModal = false">
      <div class="modal admin-modal">
        <h3>管理员验证</h3>
        <input 
          type="password" 
          v-model="adminPassword" 
          placeholder="请输入密码" 
          @keyup.enter="verifyPassword"
        />
        <div class="modal-actions">
          <button class="btn-cancel" @click="showPasswordModal = false">取消</button>
          <button class="btn-confirm" @click="verifyPassword">确认</button>
        </div>
        <p v-if="authError" class="error-text">{{ authError }}</p>
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
/* ========== 管理员面板样式 ========== */
.admin-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
}

.btn-admin {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-admin:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.admin-controls {
  display: flex;
  gap: 10px;
}

.btn-refresh {
  padding: 10px 20px;
  background: #4caf50;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover {
  background: #45a049;
}

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
