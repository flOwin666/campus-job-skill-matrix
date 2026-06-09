<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'

const props = defineProps({ data: Object })
const emit = defineEmits(['save'])

const svgEl = ref(null)
const W = ref(800)
const H = ref(500)

let nextId = 0
const CHILD_COLORS = ['#ef4444', '#eab308', '#3b82f6', '#22c55e', '#a855f7']

function pickChildColor(parentNode) {
  if (parentNode.id === 'root') {
    return CHILD_COLORS[Math.floor(Math.random() * CHILD_COLORS.length)]
  }
  return parentNode.color
}

function initNodes(title, skills) {
  nextId = 0
  const list = []
  const cx = W.value / 2, cy = H.value / 2
  list.push({ id: 'root', label: title, x: cx, y: cy, parentId: null, color: '#1d9bf0', r: 50 })

  const unique = [...new Set(skills)]
  if (unique.length === 0) unique.push('通用技能')
  unique.forEach((s, i) => {
    const angle = (i / unique.length) * Math.PI * 2 - Math.PI / 2
    const dist = 150
    list.push({
      id: `n${++nextId}`,
      label: s,
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      parentId: 'root',
      color: CHILD_COLORS[i % CHILD_COLORS.length],
      r: 34
    })
  })
  resolveCollisionsStatic(list)
  return list
}

function resolveCollisionsStatic(list) {
  for (let iter = 0; iter < 10; iter++) {
    let any = false
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.r + b.r
        if (dist < minDist && dist > 0.001) {
          any = true
          const push = (minDist - dist) / 2 + 0.5
          const ux = dx / dist * push, uy = dy / dist * push
          a.x += ux; a.y += uy; b.x -= ux; b.y -= uy
          a.x = Math.max(a.r, Math.min(W.value - a.r, a.x))
          a.y = Math.max(a.r, Math.min(H.value - a.r, a.y))
          b.x = Math.max(b.r, Math.min(W.value - b.r, b.x))
          b.y = Math.max(b.r, Math.min(H.value - b.r, b.y))
        }
      }
    }
    if (!any) break
  }
}

const nodes = reactive(initNodes(props.data.title, props.data.skills))

watch(() => props.data, d => {
  W.value = Math.max(800, window.innerWidth * 0.6)
  H.value = 500
  const fresh = initNodes(d.title, d.skills)
  nodes.length = 0
  Object.assign(nodes, fresh)
}, { deep: true })

// ---- Drag ----
const dragging = ref(null)
const pulsing = ref(null)
let dragOffset = { x: 0, y: 0 }, dragStartPos = { x: 0, y: 0 }, hasMoved = false

function onMouseDown(e, node) {
  if (e.button !== 0) return
  e.preventDefault()
  closeMenu()
  dragging.value = node.id
  hasMoved = false
  const svgRect = svgEl.value.getBoundingClientRect()
  dragOffset.x = node.x - (e.clientX - svgRect.left)
  dragOffset.y = node.y - (e.clientY - svgRect.top)
  dragStartPos.x = e.clientX
  dragStartPos.y = e.clientY
  pulsing.value = node.id
  setTimeout(() => { pulsing.value = null }, 300)
}

function onMouseMove(e) {
  if (!dragging.value) return
  const dx = e.clientX - dragStartPos.x, dy = e.clientY - dragStartPos.y
  if (!hasMoved && Math.abs(dx) + Math.abs(dy) < 3) return
  hasMoved = true
  const svgRect = svgEl.value.getBoundingClientRect()
  const nx = e.clientX - svgRect.left + dragOffset.x
  const ny = e.clientY - svgRect.top + dragOffset.y
  const node = nodes.find(n => n.id === dragging.value)
  if (!node) return
  node.x = Math.max(node.r, Math.min(W.value - node.r, nx))
  node.y = Math.max(node.r, Math.min(H.value - node.r, ny))
  liveResolve()
}

function onMouseUp() { dragging.value = null }

function liveResolve() {
  for (let iter = 0; iter < 5; iter++) {
    let any = false
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = a.r + b.r
        if (dist < minDist && dist > 0.001) {
          any = true
          const push = (minDist - dist) / 2 + 0.5
          const ux = dx / dist * push, uy = dy / dist * push
          a.x += ux; a.y += uy; b.x -= ux; b.y -= uy
          a.x = Math.max(a.r, Math.min(W.value - a.r, a.x))
          a.y = Math.max(a.r, Math.min(H.value - a.r, a.y))
          b.x = Math.max(b.r, Math.min(W.value - b.r, b.x))
          b.y = Math.max(b.r, Math.min(H.value - b.r, b.y))
        }
      }
    }
    if (!any) break
  }
}

// ---- Add child (double-click + menu) ----
function addChild(parentNode) {
  const siblings = nodes.filter(n => n.parentId === parentNode.id)
  const angleOffset = siblings.length * 0.8
  const baseAngle = Math.PI / 2 + angleOffset
  const dist = parentNode.r + 65
  const child = {
    id: `n${++nextId}`,
    label: '新主题',
    x: parentNode.x + Math.cos(baseAngle) * dist,
    y: parentNode.y + Math.sin(baseAngle) * dist,
    parentId: parentNode.id,
    color: pickChildColor(parentNode),
    r: 30
  }
  nodes.push(child)
  setTimeout(() => liveResolve(), 0)
}

function onDblClick(e, node) {
  e.preventDefault()
  addChild(node)
}

// ---- Right-click context menu ----
const menuVisible = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuTarget = ref(null)

function onContextMenu(e, node) {
  e.preventDefault()
  e.stopPropagation()
  menuTarget.value = node
  menuPos.value = { x: e.clientX, y: e.clientY }
  menuVisible.value = true
}

function closeMenu() { menuVisible.value = false; menuTarget.value = null }

function menuAdd() {
  if (menuTarget.value) addChild(menuTarget.value)
  closeMenu()
}

function menuDelete() {
  const node = menuTarget.value
  if (!node || node.id === 'root') { closeMenu(); return }
  const ids = new Set([node.id])
  let changed = true
  while (changed) {
    changed = false
    for (const n of nodes) {
      if (ids.has(n.parentId) && !ids.has(n.id)) { ids.add(n.id); changed = true }
    }
  }
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (ids.has(nodes[i].id)) nodes.splice(i, 1)
  }
  closeMenu()
}

const editingId = ref(null)

function menuRename() {
  if (!menuTarget.value) { closeMenu(); return }
  editingId.value = menuTarget.value.id
  closeMenu()
  nextTick(() => {
    const el = document.getElementById('edit-' + editingId.value)
    if (el) { el.focus(); document.execCommand('selectAll') }
  })
}

function finishEdit(id) {
  const el = document.getElementById('edit-' + id)
  if (el) {
    const txt = el.textContent.trim()
    if (txt) {
      const node = nodes.find(n => n.id === id)
      if (node) node.label = txt
    }
  }
  editingId.value = null
}

function onEditKey(e, id) {
  if (e.key === 'Enter') { e.preventDefault(); finishEdit(id) }
  if (e.key === 'Escape') { editingId.value = null }
}

// ---- Connections ----
const connections = computed(() => {
  const lines = []
  for (const n of nodes) {
    if (!n.parentId) continue
    const p = nodes.find(x => x.id === n.parentId)
    if (!p) continue
    const dx = n.x - p.x, dy = n.y - p.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) continue
    const ux = dx / dist, uy = dy / dist
    const sx = p.x + ux * p.r, sy = p.y + uy * p.r
    const ex = n.x - ux * n.r, ey = n.y - uy * n.r
    const cx1 = sx + ux * 40, cy1 = sy + uy * 40
    const cx2 = ex - ux * 40, cy2 = ey - uy * 40
    lines.push({ d: `M${sx},${sy} C${cx1},${cy1} ${cx2},${cy2} ${ex},${ey}`, color: p.color })
  }
  return lines
})

function resize() { W.value = Math.max(800, window.innerWidth * 0.6); H.value = 500 }
function onGlobalClick() { closeMenu() }

// ===== 保存功能 =====
function saveMindMap() {
  emit('save', {
    name: props.data.jobTitle || (nodes.find(n => n.id === 'root')?.label || '未命名导图'),
    nodes: JSON.parse(JSON.stringify(nodes)),
    savedAt: new Date().toISOString()
  })
}

// ===== 恢复保存的导图 =====
function restoreNodes(savedNodes) {
  nodes.length = 0
  nextId = 0
  for (const n of savedNodes) {
    const idNum = parseInt(n.id.replace(/[^0-9]/g, ''))
    if (!isNaN(idNum) && idNum > nextId) nextId = idNum
  }
  nextId++
  Object.assign(nodes, savedNodes)
}
defineExpose({ restoreNodes })

onMounted(() => { window.addEventListener('resize', resize); document.addEventListener('click', onGlobalClick); resize() })
onUnmounted(() => { window.removeEventListener('resize', resize); document.removeEventListener('click', onGlobalClick) })
</script>

<template>
  <div class="mindmap-wrap">
    <svg ref="svgEl"
      :viewBox="`0 0 ${W} ${H}`"
      :width="W" :height="H"
      @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp"
      @contextmenu.prevent
      class="mindmap-svg"
    >
      <defs>
        <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/></filter>
      </defs>

      <!-- connections -->
      <path v-for="(conn, i) in connections" :key="'c'+i"
        :d="conn.d" fill="none" :stroke="conn.color" stroke-width="2.5" opacity="0.35" />

      <!-- nodes -->
      <g v-for="node in nodes" :key="node.id"
        :transform="`translate(${node.x},${node.y})`"
        :style="{ cursor: dragging === node.id ? 'grabbing' : 'grab' }"
        @mousedown="onMouseDown($event, node)"
        @dblclick.prevent="onDblClick($event, node)"
        @contextmenu="onContextMenu($event, node)"
        filter="url(#shadow)"
      >
        <circle :r="node.r" :fill="node.color + '18'" :stroke="node.color" stroke-width="2"
          :class="{ 'node-pulse': pulsing === node.id }" />
        <circle v-if="pulsing === node.id" :r="node.r" fill="none" :stroke="node.color" stroke-width="3" class="pulse-ring" />
        <circle v-if="node.id === 'root'" :r="node.r + 4" fill="none" :stroke="node.color" stroke-width="1" opacity="0.25" />

        <!-- label (static) -->
        <foreignObject v-if="editingId !== node.id"
          :x="-node.r" :y="-12" :width="node.r*2" :height="24"
          style="pointer-events:none"
        >
          <div xmlns="http://www.w3.org/1999/xhtml"
            style="text-align:center;font-size:12px;font-weight:500;color:#e0e0e0;line-height:24px;overflow:hidden;text-overflow:ellipsis;user-select:none"
          >{{ node.label }}</div>
        </foreignObject>

        <!-- label (editing) -->
        <foreignObject v-else :x="-node.r" :y="-12" :width="node.r*2" :height="24">
          <div xmlns="http://www.w3.org/1999/xhtml"
            :id="'edit-'+node.id" contenteditable="true"
            style="text-align:center;font-size:12px;font-weight:500;color:#fff;line-height:24px;outline:none;background:rgba(255,255,255,0.1);border-radius:4px"
            @blur="finishEdit(node.id)"
            @keydown="onEditKey($event, node.id)"
          >{{ node.label }}</div>
        </foreignObject>
      </g>
    </svg>

    <!-- Context Menu -->
    <div v-if="menuVisible" class="ctx-menu" :style="{ left: menuPos.x + 'px', top: menuPos.y + 'px' }" @click.stop>
      <div class="ctx-item" @click="menuAdd">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        新增子节点
      </div>
      <div class="ctx-item" @click="menuRename">
        <svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        重命名
      </div>
      <div class="ctx-divider"></div>
      <div class="ctx-item ctx-danger" :class="{ disabled: menuTarget?.id === 'root' }" @click="menuDelete">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        删除
      </div>
    </div>

    <div class="mindmap-hint">长按拖拽 · 双击新建分支 · 右键打开菜单</div>

    <!-- 保存按钮 -->
    <button class="mindmap-save-btn" @click="saveMindMap" title="保存到导图库">
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
      保存
    </button>
  </div>
</template>

<style scoped>
.mindmap-wrap {
  max-width: 66%; margin: 0 auto 12px;
  border: 1px solid #1f2328; border-radius: 12px;
  overflow: visible; background: #0d1114;
  position: relative;
}
.mindmap-svg { display: block; width: 100%; height: auto; }
.mindmap-hint {
  text-align: center; font-size: 11px; color: #445; padding: 8px 0;
  border-top: 1px solid #1a1d21;
}
.node-pulse { animation: nodePulse 0.3s ease-out; transform-origin: center; transform-box: fill-box; }
.pulse-ring { animation: pulseRing 0.4s ease-out forwards; transform-origin: center; transform-box: fill-box; }
@keyframes nodePulse {
  0% { transform: scale(1); }
  50% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
@keyframes pulseRing {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}

/* ---- Context Menu ---- */
.ctx-menu {
  position: fixed; z-index: 2000;
  background: #1a1e24; border: 1px solid #2f3336; border-radius: 10px;
  padding: 6px 0; min-width: 160px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.06);
  animation: menuIn 0.15s ease-out;
}
@keyframes menuIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.ctx-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px; font-size: 13px; color: #c5cdd3;
  cursor: pointer; transition: all 0.15s;
}
.ctx-item:hover { background: rgba(29,161,242,0.1); color: #fff; }
.ctx-item svg {
  width: 16px; height: 16px; stroke: currentColor; fill: none;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}
.ctx-danger { color: #e74c3c; }
.ctx-danger:hover { background: rgba(231,76,60,0.1); color: #ff6b6b; }
.ctx-danger.disabled { opacity: 0.3; pointer-events: none; }
.ctx-divider { height: 1px; background: #2f3336; margin: 4px 12px; }

.mindmap-save-btn {
  position: absolute; bottom: 40px; right: 12px;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 14px;
  background: rgba(29,155,240,0.12);
  border: 1px solid rgba(29,155,240,0.25);
  color: #1d9bf0; border-radius: 8px;
  font-size: 12px; font-weight: 500; cursor: pointer;
  transition: all 0.2s; z-index: 5;
}
.mindmap-save-btn:hover {
  background: rgba(29,155,240,0.22);
  border-color: #1d9bf0;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(29,155,240,0.15);
}
</style>
