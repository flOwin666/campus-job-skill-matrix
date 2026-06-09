<script setup>
import { ref, watch, onMounted } from 'vue'

const emit = defineEmits(['load'])

const items = ref([])
const STORAGE_KEY = 'mindmap_library'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    items.value = raw ? JSON.parse(raw) : []
  } catch { items.value = [] }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
}

// ---- 右键菜单 ----
const menuVisible = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuTarget = ref(null)
const renamingId = ref(null)
const renameText = ref('')

function onContextMenu(e, item) {
  e.preventDefault()
  menuTarget.value = item
  menuPos.value = { x: e.clientX, y: e.clientY }
  menuVisible.value = true
}

function closeMenu() { menuVisible.value = false; menuTarget.value = null }

function menuLoad() {
  if (menuTarget.value) emit('load', menuTarget.value.nodes)
  closeMenu()
}

function menuRename() {
  if (!menuTarget.value) return
  renamingId.value = menuTarget.value.id
  renameText.value = menuTarget.value.name
  closeMenu()
}

function finishRename(id) {
  const item = items.value.find(i => i.id === id)
  if (item && renameText.value.trim()) {
    item.name = renameText.value.trim()
    saveToStorage()
  }
  renamingId.value = null
}

function onRenameKey(e, id) {
  if (e.key === 'Enter') { e.preventDefault(); finishRename(id) }
  if (e.key === 'Escape') { renamingId.value = null }
}

function menuDelete() {
  if (menuTarget.value) {
    items.value = items.value.filter(i => i.id !== menuTarget.value.id)
    saveToStorage()
  }
  closeMenu()
}

// ---- 接收外部保存 ----
function addItem(data) {
  // 去重：同名且相同时间戳的跳过
  const dup = items.value.find(i => i.name === data.name && i.savedAt === data.savedAt)
  if (dup) return
  const item = { id: 'lib_' + Date.now(), name: data.name, nodes: data.nodes, savedAt: data.savedAt }
  items.value.push(item)
  saveToStorage()
}

// ---- 拖拽 ----
function onDragStart(e, item) {
  e.dataTransfer.setData('application/json', JSON.stringify(item.nodes))
  e.dataTransfer.effectAllowed = 'copy'
}

function onGlobalClick() { closeMenu(); if (renamingId.value) finishRename(renamingId.value) }

defineExpose({ addItem, items })

onMounted(() => { loadFromStorage(); document.addEventListener('click', onGlobalClick) })
</script>

<template>
  <div class="lib-panel">
    <div class="lib-header">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <span>导图库</span>
      <span class="lib-count" v-if="items.length">{{ items.length }}</span>
    </div>

    <div class="lib-body" v-if="items.length">
      <div
        v-for="item in items" :key="item.id"
        class="lib-item"
        draggable="true"
        @dragstart="onDragStart($event, item)"
        @contextmenu="onContextMenu($event, item)"
        @dblclick="emit('load', item.nodes)"
      >
        <div class="lib-item-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" stroke-width="1.5"><circle cx="12" cy="4" r="2.5"/><circle cx="4" cy="20" r="2.5"/><circle cx="20" cy="20" r="2.5"/><line x1="12" y1="6.5" x2="5.5" y2="18"/><line x1="12" y1="6.5" x2="18.5" y2="18"/></svg>
        </div>
        <div class="lib-item-info">
          <div class="lib-item-name" v-if="renamingId !== item.id">{{ item.name }}</div>
          <input
            v-else class="lib-rename-input"
            v-model="renameText"
            @keydown="onRenameKey($event, item.id)"
            @blur="finishRename(item.id)"
            @click.stop
          />
          <div class="lib-item-date">{{ new Date(item.savedAt).toLocaleString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }}</div>
        </div>
      </div>
    </div>

    <div class="lib-empty" v-else>
      <svg viewBox="0 0 24 24" width="28" height="28" stroke="#445" fill="none" stroke-width="1.5"><circle cx="12" cy="4" r="2.5"/><circle cx="4" cy="20" r="2.5"/><circle cx="20" cy="20" r="2.5"/><line x1="12" y1="6.5" x2="5.5" y2="18"/><line x1="12" y1="6.5" x2="18.5" y2="18"/></svg>
      <div>保存的导图将出现在这里</div>
      <div class="lib-empty-hint">点击导图右下角"保存"按钮</div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="menuVisible" class="lib-menu" :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }" @click.stop>
      <div class="lib-menu-item" @click="menuLoad">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" fill="none" stroke-width="2"/></svg>
        加载到画布
      </div>
      <div class="lib-menu-item" @click="menuRename">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" fill="none" stroke-width="2"/></svg>
        重命名
      </div>
      <div class="lib-menu-divider"></div>
      <div class="lib-menu-item lib-menu-danger" @click="menuDelete">
        <svg viewBox="0 0 24 24" width="14" height="14"><polyline points="3 6 5 6 21 6" stroke="currentColor" fill="none" stroke-width="2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" fill="none" stroke-width="2"/></svg>
        删除
      </div>
    </div>
  </div>
</template>

<style scoped>
.lib-panel {
  width: 200px; flex-shrink: 0;
  background: #0d1114; border: 1px solid #1f2328; border-radius: 12px;
  display: flex; flex-direction: column; overflow: hidden;
  max-height: 500px;
}
.lib-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px; border-bottom: 1px solid #1a1d21;
  color: #8899a6; font-size: 13px; font-weight: 600;
  flex-shrink: 0;
}
.lib-header svg { stroke: #556; }
.lib-count {
  margin-left: auto; background: #1d9bf020; color: #1d9bf0;
  font-size: 11px; padding: 2px 8px; border-radius: 10px;
}
.lib-body {
  flex: 1; overflow-y: auto; padding: 6px 8px;
  scrollbar-gutter: stable;
}
.lib-body::-webkit-scrollbar { width: 4px; }
.lib-body::-webkit-scrollbar-thumb { background: #2f3336; border-radius: 2px; }
.lib-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 8px; border-radius: 8px; cursor: grab;
  transition: all 0.15s; margin-bottom: 2px;
}
.lib-item:hover { background: rgba(29,161,240,0.06); }
.lib-item:active { cursor: grabbing; }
.lib-item-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(29,161,240,0.08); display: flex;
  align-items: center; justify-content: center; flex-shrink: 0;
}
.lib-item-icon svg { stroke: #1d9bf0; }
.lib-item-info { flex: 1; min-width: 0; }
.lib-item-name {
  font-size: 12px; font-weight: 500; color: #c5cdd3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.lib-item-date { font-size: 10px; color: #445; margin-top: 2px; }
.lib-rename-input {
  background: #202327; border: 1px solid #1d9bf0; color: #e7e9ea;
  padding: 3px 6px; border-radius: 4px; font-size: 12px; width: 100%;
  outline: none; font-family: inherit;
}
.lib-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; padding: 30px 16px;
  color: #445; font-size: 12px; text-align: center;
}
.lib-empty-hint { font-size: 11px; color: #333; }
.lib-menu {
  position: fixed; z-index: 3000;
  background: #1a1e24; border: 1px solid #2f3336; border-radius: 10px;
  padding: 6px 0; min-width: 140px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  animation: menuIn 0.12s ease-out;
}
@keyframes menuIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.lib-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; font-size: 12px; color: #c5cdd3;
  cursor: pointer; transition: all 0.15s;
}
.lib-menu-item:hover { background: rgba(29,161,242,0.1); color: #fff; }
.lib-menu-item svg { stroke: currentColor; }
.lib-menu-danger { color: #e74c3c; }
.lib-menu-danger:hover { background: rgba(231,76,60,0.1); color: #ff6b6b; }
.lib-menu-divider { height: 1px; background: #2f3336; margin: 4px 10px; }
</style>
