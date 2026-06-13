<script setup>
import { ref, nextTick, watch } from 'vue'

const props = defineProps({
  apiBase: { type: String, default: '' }
})

// 消息列表 { role, content, toolProgress, done }
const messages = ref([])
const inputText = ref('')
const isLoading = ref(false)
const error = ref('')
const connected = ref(false)
const chatBody = ref(null)
let welcomeAdded = false

// SSE 流式解析
async function sendMessage(hidden) {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  messages.value.push({ role: 'user', content: text, hidden: !!hidden })
  inputText.value = ''
  isLoading.value = true
  error.value = ''

  const aiIdx = messages.value.length
  messages.value.push({ role: 'assistant', content: '', done: false })

  try {
    const res = await fetch(props.apiBase + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.value.filter((m, i, arr) => {
        // 当前隐藏指令必须发送（否则LLM收不到分析请求），旧隐藏指令排除
        if (m.hidden) return i === arr.length - 1
        return m.role !== 'assistant' || m.done
      }).map(m => ({ role: m.role, content: m.content })) })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const errMsg = res.status === 429 ? '请求太频繁，请稍后再试（每5分钟限30次）'
        : res.status === 503 ? 'AI 助手未配置（需要管理员设置 LLM_KEY）'
        : (err.error || `服务异常 (${res.status})`)
      messages.value[aiIdx].content = errMsg
      messages.value[aiIdx].done = true
      error.value = errMsg
      return
    }

    connected.value = true
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const d = line.slice(6)
        if (d === '[DONE]') continue
        try {
          const evt = JSON.parse(d)
          if (evt.type === 'tool_start') {
            messages.value[aiIdx].toolProgress = `正在查询: ${evt.tool}...`
          } else if (evt.type === 'tool_result') {
            messages.value[aiIdx].toolProgress = ''
          } else if (evt.type === 'tool_progress') {
            messages.value[aiIdx].toolProgress = evt.message
          } else if (evt.type === 'error') {
            messages.value[aiIdx].content = evt.message
            error.value = evt.message
          } else if (evt.content) {
            messages.value[aiIdx].content += evt.content
          }
        } catch {}
      }
    }
    messages.value[aiIdx].done = true
  } catch (e) {
    connected.value = false
    messages.value[aiIdx].content = '无法连接服务器，请确认后端服务已启动（node server.js）'
    messages.value[aiIdx].done = true
  } finally {
    isLoading.value = false
    await nextTick()
    if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight
  }
}

function onEnter(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
}

// 首次打开加欢迎消息
function ensureWelcome() {
  if (!welcomeAdded && messages.value.length === 0) {
    welcomeAdded = true
    messages.value.push({
      role: 'assistant', content: '', done: true,
      welcome: true
    })
  }
}

// 简单的 Markdown 渲染（加粗/标题/代码/列表）
function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;color:#e7e9ea">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:10px 0 4px;color:#e7e9ea">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#202327;padding:1px 6px;border-radius:3px;color:#f59e0b">$1</code>')
    .replace(/\n\s*[-•]\s/g, '\n<span style="color:#1d9bf0">·</span> ')
    .replace(/\n/g, '<br>')
}

// 欢迎消息内容
const welcomeHtml = `<strong>你好！我是求职助手 🤖</strong><br><br>
可以帮你：<br>
<span style="color:#1d9bf0">·</span> <strong>搜索岗位</strong> — "有没有字节的AI实习岗？"<br>
<span style="color:#1d9bf0">·</span> <strong>了解技能</strong> — "Python在这批岗位里重要吗？"<br>
<span style="color:#1d9bf0">·</span> <strong>学习路线</strong> — 发送岗位链接或点击弹窗的分析按钮<br>
<span style="color:#1d9bf0">·</span> <strong>数据概况</strong> — "现在有哪些公司在招人？"<br><br>
<span style="color:#8899a6;font-size:11px">我只回答求职和技能相关的问题。</span>`

defineExpose({ sendMessageAutomatically: (text, hidden) => { inputText.value = text; sendMessage(hidden) }, ensureWelcome })
</script>

<template>
  <div class="chat-panel">
    <!-- 头部 -->
    <div class="chat-header">
      <div>
        <span class="chat-title">🤖 求职助手</span>
      </div>
      <div class="chat-status" :class="{ online: connected }">
        <span class="status-dot" :class="{ online: connected }"></span>
        {{ connected ? '已连接' : '未连接' }}
      </div>
    </div>

    <!-- 消息区 -->
    <div class="chat-body" ref="chatBody">
      <template v-for="(msg, i) in messages" :key="i">
        <!-- 隐藏消息不渲染 -->
        <template v-if="!msg.hidden">
        <!-- 欢迎消息 -->
        <div v-if="msg.welcome" class="chat-msg assistant">
          <div class="chat-bubble assistant" v-html="welcomeHtml"></div>
        </div>

        <!-- 用户消息 -->
        <div v-else-if="msg.role === 'user'" class="chat-msg user">
          <div class="chat-bubble user">{{ msg.content }}</div>
        </div>

        <!-- AI 消息 -->
        <div v-else class="chat-msg assistant">
          <div class="chat-bubble assistant">
            <!-- 工具进度 -->
            <div v-if="msg.toolProgress" class="tool-progress">
              <span class="tool-spinner"></span>
              {{ msg.toolProgress }}
            </div>
            <!-- 内容（Markdown 渲染） -->
            <div v-if="msg.content" v-html="renderMarkdown(msg.content)"></div>
            <!-- 加载动画 -->
            <span v-if="!msg.done && !msg.content && !msg.toolProgress" class="typing">
              <span></span><span></span><span></span>
            </span>
          </div>
        </div>
        </template>
      </template>

      <!-- 错误 -->
      <div v-if="error && !messages.find(m => m.role === 'assistant' && m.content === error)" class="chat-msg assistant">
        <div class="chat-bubble assistant error">{{ error }}</div>
      </div>
    </div>

    <!-- 输入区 -->
    <div class="chat-input-area">
      <textarea
        v-model="inputText"
        class="chat-input"
        placeholder="输入问题，例如：有没有Python的岗位？"
        rows="1"
        @keydown="onEnter"
        :disabled="isLoading"
      ></textarea>
      <button class="chat-send" @click="sendMessage" :disabled="isLoading || !inputText.trim()">
        {{ isLoading ? '···' : '发送' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel { display: flex; flex-direction: column; height: 100%; }
.chat-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px; border-bottom: 1px solid #2f3336; flex-shrink: 0;
}
.chat-title { color: #e7e9ea; font-size: 15px; font-weight: 600; }
.chat-status { color: #555; font-size: 11px; display: flex; align-items: center; gap: 5px; }
.chat-status.online { color: #34d399; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #555; }
.status-dot.online { background: #34d399; }
.chat-body {
  flex: 1; overflow-y: auto; padding: 14px;
  scrollbar-gutter: stable;
}
.chat-body::-webkit-scrollbar { width: 5px; }
.chat-body::-webkit-scrollbar-track { background: #0f1419; }
.chat-body::-webkit-scrollbar-thumb { background: #2f3336; border-radius: 3px; }
.chat-msg { margin-bottom: 10px; display: flex; }
.chat-msg.user { justify-content: flex-end; }
.chat-msg.assistant { justify-content: flex-start; }
.chat-bubble {
  max-width: 83%; padding: 9px 14px; border-radius: 14px;
  font-size: 13px; line-height: 1.7; word-break: break-word;
}
.chat-bubble.user { background: #1d9bf0; color: #fff; border-bottom-right-radius: 4px; }
.chat-bubble.assistant { background: #202327; color: #e7e9ea; border-bottom-left-radius: 4px; }
.chat-bubble.assistant.error { color: #e74c3c; }
.tool-progress {
  color: #f59e0b; font-size: 12px; margin-bottom: 4px;
  display: flex; align-items: center; gap: 6px;
}
.tool-spinner {
  width: 14px; height: 14px; border: 2px solid #f59e0b30;
  border-top-color: #f59e0b; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.typing { display: inline-flex; gap: 3px; padding: 4px 0; }
.typing span {
  width: 6px; height: 6px; border-radius: 50%; background: #8899a6;
  animation: bounce 1.2s infinite;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}
.chat-input-area {
  display: flex; gap: 8px; padding: 10px 14px;
  border-top: 1px solid #2f3336; flex-shrink: 0;
}
.chat-input {
  flex: 1; background: #202327; border: 1px solid #1d9bf0;
  color: #e7e9ea; padding: 10px 14px; border-radius: 10px;
  font-size: 13px; resize: none; min-height: 20px; max-height: 80px;
  outline: none; font-family: inherit;
}
.chat-input:focus { border-color: #1d9bf0; }
.chat-input:disabled { opacity: 0.5; }
.chat-send {
  background: #1d9bf0; color: #fff; border: none;
  padding: 10px 18px; border-radius: 10px; cursor: pointer;
  font-size: 13px; font-weight: 500; white-space: nowrap;
  transition: background 0.2s;
}
.chat-send:hover:not(:disabled) { background: #1a8cd8; }
.chat-send:disabled { opacity: 0.4; cursor: default; }
</style>
