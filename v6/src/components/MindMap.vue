<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({ data: Object })

const svgEl = ref(null)
const W = ref(800)
const H = ref(500)

let nextId = 0

function initNodes(title, skills) {
  nextId = 0
  const list = []
  const cx = W.value / 2, cy = H.value / 2
  list.push({ id: 'root', label: title, x: cx, y: cy, parentId: null, color: '#1d9bf0', r: 50 })

  const colors = ['#34d399', '#f59e0b', '#1da1f2', '#a78bfa', '#fb7185', '#38bdf8', '#fbbf24', '#818cf8']
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
      color: colors[i % colors.length],
      r: 34
    })
  })
  // 跑一轮碰撞确保初始无重叠
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
          const nx = dx / dist * push, ny = dy / dist * push
          a.x += nx; a.y += ny; b.x -= nx; b.y -= ny
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

// ---- Drag (immediate, no delay) ----
const dragging = ref(null)
const pulsing = ref(null)
let dragOffset = { x: 0, y: 0 }, dragStartPos = { x: 0, y: 0 }, hasMoved = false

function onMouseDown(e, node) {
  if (e.button !== 0) return
  e.preventDefault()
  dragging.value = node.id
  hasMoved = false
  const svgRect = svgEl.value.getBoundingClientRect()
  dragOffset.x = node.x - (e.clientX - svgRect.left)
  dragOffset.y = node.y - (e.clientY - svgRect.top)
  dragStartPos.x = e.clientX
  dragStartPos.y = e.clientY
  // click pulse
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

function onMouseUp() {
  dragging.value = null
}

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
          const nx = dx / dist * push, ny = dy / dist * push
          a.x += nx; a.y += ny; b.x -= nx; b.y -= ny
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

// ---- Double-click: new child ----
function onDblClick(e, node) {
  e.preventDefault()
  const child = {
    id: `n${++nextId}`,
    label: '新主题',
    x: node.x + 20,
    y: node.y + node.r + 45,
    parentId: node.id,
    color: '#a78bfa',
    r: 30
  }
  nodes.push(child)
  // 跑碰撞确保不和已有节点重叠
  setTimeout(() => liveResolve(), 0)
}

// ---- Right-click: delete ----
function onContextMenu(e, node) {
  e.preventDefault()
  if (node.id === 'root') return
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
}

// ---- Edit label ----
const editingId = ref(null)
function startEdit(id) {
  editingId.value = id
  setTimeout(() => {
    const el = document.getElementById('edit-' + id)
    if (el) { el.focus(); el.select() }
  }, 50)
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

function resize() {
  W.value = Math.max(800, window.innerWidth * 0.6)
  H.value = 500
}
onMounted(() => { window.addEventListener('resize', resize); resize() })
onUnmounted(() => { window.removeEventListener('resize', resize) })
</script>

<template>
  <div class="mindmap-wrap">
    <svg ref="svgEl"
      :viewBox="`0 0 ${W} ${H}`"
      :width="W" :height="H"
      @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp"
      class="mindmap-svg"
    >
      <defs>
        <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.3"/></filter>
      </defs>

      <!-- connections -->
      <g v-for="(conn, i) in connections" :key="'c'+i">
        <path :d="conn.d" fill="none" :stroke="conn.color" stroke-width="2.5" opacity="0.35" />
      </g>

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

        <foreignObject v-if="editingId !== node.id"
          :x="-node.r" :y="-12" :width="node.r*2" :height="24"
          style="pointer-events:none"
        >
          <div xmlns="http://www.w3.org/1999/xhtml"
            style="text-align:center;font-size:12px;font-weight:500;color:#e0e0e0;line-height:24px;overflow:hidden;text-overflow:ellipsis;user-select:none;max-width:100%"
            @dblclick.stop="startEdit(node.id)"
          >{{ node.label }}</div>
        </foreignObject>

        <foreignObject v-else :x="-node.r" :y="-12" :width="node.r*2" :height="24">
          <div xmlns="http://www.w3.org/1999/xhtml"
            :id="'edit-'+node.id" :contenteditable="true"
            style="text-align:center;font-size:12px;font-weight:500;color:#fff;line-height:24px;outline:none;background:rgba(255,255,255,0.06);border-radius:4px;min-width:40px"
            @blur="finishEdit(node.id)"
            @keydown="onEditKey($event, node.id)"
          >{{ node.label }}</div>
        </foreignObject>
      </g>
    </svg>
    <div class="mindmap-hint">长按拖拽 · 双击新建分支 · 双击文字编辑 · 右键删除</div>
  </div>
</template>

<style scoped>
.mindmap-wrap {
  max-width: 66%; margin: 0 auto 12px;
  border: 1px solid #1f2328; border-radius: 12px;
  overflow: hidden; background: #0d1114;
}
.mindmap-svg { display: block; width: 100%; height: auto; }
.mindmap-hint {
  text-align: center; font-size: 11px; color: #445; padding: 8px 0;
  border-top: 1px solid #1a1d21;
}
.node-pulse { animation: nodePulse 0.3s ease-out; transform-origin: center; }
.pulse-ring { animation: pulseRing 0.4s ease-out forwards; transform-origin: center; }
@keyframes nodePulse {
  0% { transform: scale(1); }
  50% { transform: scale(0.9); }
  100% { transform: scale(1); }
}
@keyframes pulseRing {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}
</style>
