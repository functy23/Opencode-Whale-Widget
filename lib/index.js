import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

// Package root: lib/index.js -> package root. Keeps the bundle relocatable
// when installed as a normal DSH npm plugin (node_modules or a local link).
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// DSH home: used for the widget size/usage memory files, since node_modules may
// be read-only or cleaned on update.
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')

// Whale image: package-relative first, legacy absolute paths as fallback.
const IMAGE_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'DSniang1.png'),
  path.join(PACKAGE_ROOT, 'assets', 'DSniang02.png'),
  'D:/TestBox/deepseek/DSniang1.png',
  'D:/TestBox/deepseek/DSniang02.png',
  'D:/TestBox/deepseek/skin/DSniang02.png',
]

// Size memory file: prefer writable DSH home locations, then legacy fallbacks.
const SIZE_FILE_CANDIDATES = [
  path.join(DSH_HOME, '.dshw-size.json'),
  path.join(DSH_HOME, 'profiles', 'web', '.dshw-size.json'),
  'D:/TestBox/deepseek/.dshw-size.json',
  'D:/TestBox/deepseek/skin/.dshw-size.json',
]

// Sound assets: package-relative first (ship Ya1/Ya2/D1/D2.mp3 in assets/ for
// sounds out of the box), legacy paths as fallback.
const SOUND_SETS = {
  duck: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'Ya1.mp3'), 'D:/TestBox/deepseek/skin/Ya1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'Ya2.mp3'), 'D:/TestBox/deepseek/skin/Ya2.mp3'],
  },
  fx1: {
    press: [path.join(PACKAGE_ROOT, 'assets', 'D1.mp3'), 'D:/TestBox/deepseek/skin/D1.mp3'],
    release: [path.join(PACKAGE_ROOT, 'assets', 'D2.mp3'), 'D:/TestBox/deepseek/skin/D2.mp3'],
  },
}
function soundSetFromUrl(url) {
  try {
    const q = String(url || '').split('?')[1] || ''
    const m = /(?:^|&)set=([^&]+)/.exec(q)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (err) { return '' }
}
// OpenCode Go 用量数据源（按优先级）：
// 1. 官方 API：GET /zen/go/v1/usage（Bearer OPENCODE_GO_API_KEY，控制台创建的 API key）
// 2. Cookie 通道：抓 workspace/go 页面 SSR HTML（与 UsageBar 一致，官方 API 未部署前的方式）
// 登录采用 OpenCode CLI 同款设备码流程（client_id=opencode-cli，默认浏览器完成认证）：
//   POST /console/auth/device/code → 浏览器输入用户码 → 轮询 /console/auth/device/token
const OPENCODE_BASE_URL = 'https://opencode.ai'
const OPENCODE_CONSOLE_URL = 'https://opencode.ai/console'
const ZEN_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
const DEVICE_CLIENT_ID = 'opencode-cli'
const USAGE_TTL_MS = 60000
const RUA_GIF_CANDIDATES = [
  path.join(PACKAGE_ROOT, 'assets', 'rua.gif'),
  'D:/TestBox/deepseek/skin/rua.gif',
  'D:/TestBox/deepseek/rua.gif',
]
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

const WIDGET_JS = `(function () {
if (window.__dshWhaleWidget) return
window.__dshWhaleWidget = true

var MIN_SCALE = 0.6
var MAX_SCALE = 2.5
var STEP = 0.1
var CLICK_SQ = 9
var REFRESH_MS = 60000
var CHANGE_MS = 900
var ANIM_MS = 700
var BUBBLE_MS = 5000
var FETCH_TIMEOUT_MS = 25000
var BALANCE_URL = '/dsh-whale/balance.json'
var SIZE_URL = '/dsh-whale/size.json'
var IMG_URL = '/dsh-whale/image.png?v=2'
var GIF_URL = '/dsh-whale/rua.gif'

var css = [
  '.dshwv-root{position:fixed;right:0;bottom:0;--dshw-scale:1;--dshw-base:clamp(122px,calc(min(250px,min(100vw,100vh) * 0.28) * var(--dshw-scale)),625px);width:var(--dshw-base);height:var(--dshw-base);pointer-events:none;user-select:none;-webkit-user-select:none;z-index:9999;font-family:inherit;transition:left .16s ease,top .16s ease,transform .3s ease}',
  '.dshwv-root.dshwv-left{transform:scaleX(-1)}',
  '.dshwv-root.dshwv-dragging{cursor:grabbing;transition:none}',
  '.dshwv-body{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}',
  '.dshwv-img{position:absolute;right:0;bottom:0;width:59.45%;height:59.45%;display:block;pointer-events:none;-webkit-user-drag:none;user-select:none}',
  '.dshwv-bubble{position:absolute;left:0;top:0;width:100%;aspect-ratio:1026/700;pointer-events:none;z-index:1;--dshw-u:calc(var(--dshw-base) / 1026)}',
  '.dshwv-bubble svg{display:block;width:100%;height:100%;pointer-events:none}',
  '.dshwv-bubble svg path,.dshwv-bubble svg ellipse{pointer-events:none;cursor:pointer}',
  '.dshwv-bubble.dshwv-bubble-open svg path,.dshwv-bubble.dshwv-bubble-open svg ellipse{pointer-events:visiblePainted}',
  '.dshwv-bubble .dshwv-bshape,.dshwv-bubble .dshwv-b1,.dshwv-bubble .dshwv-b2{opacity:0;transform:scale(.7);transform-box:fill-box;transform-origin:50% 50%;transition:opacity .2s ease,transform .2s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape,.dshwv-bubble.dshwv-bubble-open .dshwv-b1,.dshwv-bubble.dshwv-bubble-open .dshwv-b2{opacity:1;transform:none}',
  '.dshwv-gif{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);max-width:calc(var(--dshw-u) * 560);max-height:calc(var(--dshw-u) * 400);display:none;opacity:0;transition:opacity .2s ease;pointer-events:none;-webkit-user-drag:none;user-select:none;object-fit:contain}',
  '.dshwv-root.dshwv-left .dshwv-gif{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-gif{opacity:1}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b2{transition-delay:0s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-b1{transition-delay:.13s}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-bshape{transition-delay:.26s}',
  '.dshwv-bubble .dshwv-bshape{transition-delay:.1s}',
  '.dshwv-bubble .dshwv-b1{transition-delay:.2s}',
  '.dshwv-bubble .dshwv-b2{transition-delay:.3s}',
  '.dshwv-text{position:absolute;left:44.25%;top:38%;transform:translate(-50%,-50%);text-align:center;color:#536ba9;line-height:1.15;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .16s ease,transform .3s ease}',
  '.dshwv-bubble.dshwv-bubble-open .dshwv-text{opacity:1;transition:opacity .16s ease .36s,transform .3s ease}',
  '.dshwv-root.dshwv-left .dshwv-text{transform:translate(-50%,-50%) scaleX(-1)}',
  '.dshwv-label{font-size:calc(var(--dshw-u) * 66);font-weight:600;letter-spacing:.06em}',
  '.dshwv-amount{font-size:calc(var(--dshw-u) * 128);font-weight:800;line-height:1.05}',
  '.dshwv-period{font-size:calc(var(--dshw-u) * 104);font-weight:800;line-height:1.05}',
  '.dshwv-wrap{white-space:normal;max-width:calc(var(--dshw-u) * 560);line-height:1.2}',
  '.dshwv-hint{font-size:calc(var(--dshw-u) * 56);color:#9fb0d9;letter-spacing:.02em;margin-top:calc(var(--dshw-u) * 9);min-height:calc(var(--dshw-u) * 64);line-height:1.15}',
  '.dshwv-menu-btn{position:absolute;top:calc(40.55% + 4px);right:4px;width:26px;height:26px;border:none;border-radius:6px;background:rgba(32,49,112,.85);cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:0;z-index:2;opacity:0;transition:opacity .15s ease}',
  '.dshwv-menu-btn.dshwv-menu-btn-visible{opacity:1}',
  '.dshwv-menu-btn span{display:block;width:14px;height:2px;background:#fff;border-radius:1px}',
  '.dshwv-menu-btn:hover{background:#203170}',
  '.dshwv-menu{position:fixed;min-width:196px;background:rgba(255,255,255,.92);border:1px solid rgba(32,49,112,.35);border-radius:10px;padding:10px 12px;opacity:0;transform:scale(.92) translateY(-4px);transform-origin:top right;transition:opacity .18s ease,transform .2s cubic-bezier(.34,1.56,.64,1);pointer-events:none;z-index:10000;box-shadow:0 6px 18px rgba(0,0,0,.18);color-scheme:light}',
  '.dshwv-menu.dshwv-menu-open{opacity:1;transform:scale(1) translateY(0);pointer-events:auto}',
  '.dshwv-menu-row{display:flex;align-items:center;gap:8px;margin:5px 0;color:#203170;font-size:12px;white-space:nowrap}',
  '.dshwv-range{flex:1;min-width:0;accent-color:#203170}',
  '.dshwv-number{width:44px;border:1px solid rgba(32,49,112,.4);border-radius:6px;padding:2px 4px;font-size:12px;color:#203170;background:#fff;box-sizing:border-box}',
  '.dshwv-number:disabled{opacity:.4;background:rgba(32,49,112,.06);cursor:not-allowed}',
  '.dshwv-sound{flex:1;border:1px solid rgba(32,49,112,.4);border-radius:6px;background:rgba(32,49,112,.08);color:#203170;font-size:12px;padding:3px 0;cursor:pointer}',
  '.dshwv-sound:hover{background:rgba(32,49,112,.16)}',
  '.dshwv-check{width:16px;height:16px;accent-color:#203170;cursor:pointer;flex:0 0 auto}',
  '.dshwv-menu-sep{height:1px;background:rgba(32,49,112,.25);margin:6px 0}',
  '.dshwv-volpct{width:44px;text-align:right;color:#203170;font-size:12px}'
].join('\\n')

var styleEl = document.createElement('style')
styleEl.textContent = css
document.head.appendChild(styleEl)

var root = document.createElement('div')
root.className = 'dshwv-root'

var img = document.createElement('img')
img.className = 'dshwv-img'
img.src = IMG_URL
img.alt = 'Opencode 用量'
img.draggable = false

var menuBtn = document.createElement('button')
menuBtn.type = 'button'
menuBtn.className = 'dshwv-menu-btn'
menuBtn.title = '菜单'
menuBtn.innerHTML = '<span></span><span></span><span></span>'
menuBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu() })

var menuBox = document.createElement('div')
menuBox.className = 'dshwv-menu'
function menuLabel(text) {
  var s = document.createElement('span')
  s.textContent = text
  return s
}
function menuRow() {
  var r = document.createElement('div')
  r.className = 'dshwv-menu-row'
  return r
}
var scaleInput = document.createElement('input')
scaleInput.type = 'range'
scaleInput.min = String(MIN_SCALE)
scaleInput.max = String(MAX_SCALE)
scaleInput.step = '0.1'
scaleInput.className = 'dshwv-range'
scaleInput.value = '1.5'
var scaleNumber = document.createElement('input')
scaleNumber.type = 'number'
scaleNumber.min = '1'
scaleNumber.max = '20'
scaleNumber.step = '1'
scaleNumber.className = 'dshwv-number'
scaleNumber.value = '10'
scaleInput.addEventListener('pointerdown', function () { root.style.transition = 'none' })
scaleInput.addEventListener('input', function () { setScale(scaleInput.value) })
scaleInput.addEventListener('change', function () { root.style.transition = '' })
scaleNumber.addEventListener('focus', function () { root.style.transition = 'none' })
scaleNumber.addEventListener('blur', function () { root.style.transition = '' })
scaleNumber.addEventListener('input', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
})
scaleNumber.addEventListener('change', function () {
  var v = Math.round(Number(scaleNumber.value))
  var s = MIN_SCALE + Math.max(0, Math.min(20, v) - 1) * (MAX_SCALE - MIN_SCALE) / 19
  setScale(s)
  root.style.transition = ''
})
var soundSelect = document.createElement('select')
soundSelect.className = 'dshwv-sound'
function soundOpt(value, label) {
  var o = document.createElement('option')
  o.value = value
  o.textContent = label
  return o
}
soundSelect.appendChild(soundOpt('duck', '小黄鸭'))
soundSelect.appendChild(soundOpt('fx1', '音效1'))
soundSelect.addEventListener('change', function () { setSoundSet(soundSelect.value) })
var windowSelect = document.createElement('select')
windowSelect.className = 'dshwv-sound'
windowSelect.appendChild(soundOpt('auto', '自动 (最高)'))
windowSelect.appendChild(soundOpt('rolling', '5小时额度'))
windowSelect.appendChild(soundOpt('weekly', '本周额度'))
windowSelect.appendChild(soundOpt('monthly', '本月额度'))
windowSelect.addEventListener('change', function () { setWindowMode(windowSelect.value) })
var bubbleToggle = document.createElement('input')
bubbleToggle.type = 'checkbox'
bubbleToggle.className = 'dshwv-check'
bubbleToggle.checked = true
bubbleToggle.title = '开启/关闭思考气泡'
bubbleToggle.addEventListener('change', function () { setBubbleOn(bubbleToggle.checked) })
var scrollGapToggle = document.createElement('input')
scrollGapToggle.type = 'checkbox'
scrollGapToggle.className = 'dshwv-check'
scrollGapToggle.checked = false
scrollGapToggle.title = '开启后挂件右侧按设定像素避开滚动条；关闭则贴边（盖住滚动条）'
scrollGapToggle.addEventListener('change', function () { setScrollGapOn(scrollGapToggle.checked) })
var scrollGapInput = document.createElement('input')
scrollGapInput.type = 'number'
scrollGapInput.min = '0'
scrollGapInput.step = '1'
scrollGapInput.className = 'dshwv-number'
scrollGapInput.value = '17'
scrollGapInput.disabled = true // 默认避让关 → 宽度不可修改，勾选后启用
scrollGapInput.title = '避让滚动条的像素宽度，填 0 表示贴边'
scrollGapInput.addEventListener('input', function () { setScrollGapPx(scrollGapInput.value) })
scrollGapInput.addEventListener('change', function () { setScrollGapPx(scrollGapInput.value) })
var row1 = menuRow()
row1.appendChild(menuLabel('大小'))
row1.appendChild(scaleInput)
row1.appendChild(scaleNumber)
var row2 = menuRow()
row2.appendChild(menuLabel('音效'))
row2.appendChild(soundSelect)
var volInput = document.createElement('input')
volInput.type = 'range'
volInput.min = '0'
volInput.max = '1'
volInput.step = '0.05'
volInput.className = 'dshwv-range'
volInput.value = '0.9'
var volPct = document.createElement('span')
volPct.className = 'dshwv-volpct'
volPct.textContent = '90%'
volInput.addEventListener('input', function () { setVol(volInput.value) })
var row3 = menuRow()
row3.appendChild(menuLabel('音量'))
row3.appendChild(volInput)
row3.appendChild(volPct)
var row4 = menuRow()
row4.appendChild(menuLabel('显示窗口'))
row4.appendChild(windowSelect)
var row5 = menuRow()
row5.appendChild(menuLabel('气泡'))
row5.appendChild(bubbleToggle)
var loginBtn = document.createElement('button')
loginBtn.style.cssText = 'padding:2px 8px;margin-left:auto;cursor:pointer;border-radius:4px;border:1px solid rgba(120,130,160,.5);background:rgba(255,255,255,.08);color:inherit;font-size:11px'
loginBtn.textContent = '登录'
loginBtn.title = '设备码登录：自动打开默认浏览器完成认证，凭据自动保存'
loginBtn.addEventListener('click', function () { startLogin() })
var logoutBtn = document.createElement('button')
logoutBtn.style.cssText = loginBtn.style.cssText
logoutBtn.textContent = '登出'
logoutBtn.title = '清除已保存的 OpenCode 凭据'
logoutBtn.addEventListener('click', function () { doLogout() })
var rowAcc = menuRow()
rowAcc.appendChild(menuLabel('账号'))
rowAcc.appendChild(loginBtn)
rowAcc.appendChild(logoutBtn)
var menuSep1 = document.createElement('div')
menuSep1.className = 'dshwv-menu-sep'
var row6 = menuRow()
row6.appendChild(menuLabel('避让滚动条'))
row6.appendChild(scrollGapToggle)
row6.appendChild(menuLabel('宽度'))
row6.appendChild(scrollGapInput)
row6.appendChild(menuLabel('px'))
menuBox.appendChild(row1)
menuBox.appendChild(row2)
menuBox.appendChild(row3)
menuBox.appendChild(row4)
menuBox.appendChild(row5)
menuBox.appendChild(rowAcc)
menuBox.appendChild(menuSep1)
menuBox.appendChild(row6)

var textBox = document.createElement('div')
textBox.className = 'dshwv-text'
var labelEl = document.createElement('div')
labelEl.className = 'dshwv-label'
labelEl.textContent = 'Opencode 用量'
var amountEl = document.createElement('div')
amountEl.className = 'dshwv-amount'
var hintEl = document.createElement('div')
hintEl.className = 'dshwv-hint'
textBox.appendChild(labelEl)
textBox.appendChild(amountEl)
textBox.appendChild(hintEl)

var bubbleBox = document.createElement('div')
bubbleBox.className = 'dshwv-bubble'
bubbleBox.innerHTML = '<svg viewBox="0 0 1026 700" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
  '<path class="dshwv-bshape" fill="#FFFFFF" stroke="#203170" stroke-width="18" stroke-linejoin="round" stroke-linecap="round" d="M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z"/>' +
  '<ellipse class="dshwv-b1" cx="352" cy="561" rx="37.5" ry="26" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '<ellipse class="dshwv-b2" cx="442" cy="646" rx="24.5" ry="18" fill="#FFFFFF" stroke="#203170" stroke-width="18"/>' +
  '</svg>'
var gifEl = document.createElement('img')
gifEl.className = 'dshwv-gif'
gifEl.src = GIF_URL
gifEl.alt = ''
gifEl.draggable = false
bubbleBox.appendChild(gifEl)
var gifFailed = false
gifEl.onerror = function () { gifFailed = true }
bubbleBox.appendChild(textBox)
bubbleBox.addEventListener('click', function (e) {
  e.stopPropagation()
  if (!bubbleShown) return
  if (bubbleRandomActive) {
    // 再次点击：关闭
    hideBubble()
  } else {
    // 首次点击：切到随机台词段，并重置自动关闭计时——
    // 保证第二段台词有完整停留时间（否则第 4 秒点击只看到 0.5 秒）
    bubbleRandomActive = true
    bubbleRandomLines = pickRandomLines()
    swapBubbleContent(function () { applyBubbleLines(bubbleRandomLines) })
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
    bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
  }
})

var body = document.createElement('div')
body.className = 'dshwv-body'
body.appendChild(img)
body.appendChild(bubbleBox)
root.appendChild(body)
root.appendChild(menuBtn)
document.body.appendChild(root)
document.body.appendChild(menuBox)

// Position model: the widget is ALWAYS expressed in left/top px (so edge snaps
// animate smoothly via the CSS transition on both sides — switching to
// right/auto cannot transition and flashes). The anchor info (h/v + offsets)
// lives in state and is used by settle() to recompute coordinates on window
// resize and size changes, keeping the widget glued to its anchored edge.
var state = {
  scale: 1.5,
  h: 'right',
  hOff: 0,
  v: 'bottom',
  vOff: 0,
  left: 0,
  top: 0,
  windows: null,
  percent: null,
  kind: 'auto',
  fetchedAt: 0,
  status: 'loading',
  message: ''
}
var busy = false
var settleTimer = null
var animDelayTimer = null
var drag = null
var shown = null
var animId = null
var bubbleShown = false
var bubbleTimer = null
var bubbleRandomActive = false
var bubbleRandomLines = null
var BUBBLE_STYLE_CLASS = { A: 'dshwv-label', B: 'dshwv-amount', P: 'dshwv-period', C: 'dshwv-hint' }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function singleCenter(style, text, color, wrap) { return [null, { t: text, s: style, c: color || '', w: !!wrap }, null] }
function buildGroup1() {
  var w = state.windows
  if (!w) {
    return [
      { t: 'Opencode Go 用量', s: 'A', c: '' },
      { t: '--', s: 'B', c: '' },
      { t: '未获取到用量数据', s: 'C', c: '' },
    ]
  }
  var names = { rolling: '5小时', weekly: '本周', monthly: '本月' }
  var parts = []
  for (var k in names) {
    if (w[k]) parts.push(names[k] + ' ' + w[k].percent + '%')
  }
  var main = mainWindow()
  return [
    { t: 'Opencode Go 用量', s: 'A', c: '' },
    { t: main ? main.percent + '%' : '--', s: 'B', c: percentColor(main ? main.percent : null) },
    { t: parts.join(' · ') + (main ? ' · ' + formatReset(main.resetInSec) + '后重置' : ''), s: 'C', c: '' },
  ]
}
var RANDOM_GROUPS = [
  { w: 45, lines: buildGroup1 },
  { w: 7, lines: function () { return singleCenter('B', pickOne(['好模型... ↓', '好女孩...↓'])) } },
  { w: 7, lines: function () { return singleCenter('A', pickOne(['不知道用户有什么用，先赶走吧~', '我...我...我也要挣钱吗？', '我去吃饭啦，测完叫我', '压力一只蓝色大肥鱼？！', 'DeepSleep...', '坏了...用户彻底怒了！']), '', true) } },
  { w: 10, lines: function () { return { gif: true } } },
  { w: 3, lines: function () { return singleCenter('A', pickOne(['你目录里的dsh是什么...大烧货吗...?', '恭喜你实现token自由！token全跑了！', '真当我是便宜货啊...']), '', true) } },
  { w: 1, lines: function () { return singleCenter('B', '哦鲸鲸... ') } },
]
function pickRandomLines() {
  var total = 0
  for (var i = 0; i < RANDOM_GROUPS.length; i++) total += RANDOM_GROUPS[i].w
  var r = Math.random() * total
  for (var i = 0; i < RANDOM_GROUPS.length; i++) {
    r -= RANDOM_GROUPS[i].w
    if (r < 0) return RANDOM_GROUPS[i].lines()
  }
  return RANDOM_GROUPS[RANDOM_GROUPS.length - 1].lines()
}
function applyBubbleLines(lines) {
  if (lines && lines.gif) {
    // gif 台词组：只显示 gif，隐藏三行文字（display 必须显式覆盖 CSS 的 none）
    if (gifFailed) {
      // gif 加载失败/路由缺失：降级为文字台词，避免空白白色气泡
      lines = singleCenter('A', pickOne(['gif 加载失败了...', '今天没有动图给你看~', '呜呜 动图不见了...']), '', true)
    } else {
      if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
      gifEl.style.display = 'block'
      gifEl.style.opacity = ''
      labelEl.style.display = 'none'
      amountEl.style.display = 'none'
      hintEl.style.display = 'none'
      return
    }
  }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  var els = [labelEl, amountEl, hintEl]
  for (var i = 0; i < 3; i++) {
    var el = els[i]
    var ln = lines && lines[i]
    if (ln) {
      el.style.display = ''
      el.className = (BUBBLE_STYLE_CLASS[ln.s] || 'dshwv-label') + (ln.w ? ' dshwv-wrap' : '')
      el.textContent = ln.t
      el.style.color = ln.c || ''
    } else {
      el.style.display = 'none'
      el.textContent = ''
      el.style.color = ''
    }
  }
}
var bubbleSwapTimer = null
var hintFadeTimer = null
var gifFadeTimer = null
var lastHintText = null
function setHint(text) {
  // 首次/恢复（lastHintText===null）时直接写文本，不做淡出淡入——否则
  // 气泡打开或按压重开时会先淡出再淡入，造成「消失一下又出现」。
  // 只有气泡打开期间的内容变化（加载中→今日已用）才走动画。
  if (text === lastHintText) return
  var first = lastHintText === null
  lastHintText = text
  if (first || !bubbleShown) {
    hintEl.textContent = text
    return
  }
  hintEl.style.transition = 'opacity .18s ease'
  hintEl.style.opacity = '0'
  hintFadeTimer = setTimeout(function () {
    hintFadeTimer = null
    hintEl.textContent = text
    hintEl.style.opacity = '1'
    setTimeout(function () {
      hintEl.style.transition = ''
      hintEl.style.opacity = ''
    }, 220)
  }, 190)
}
function swapBubbleContent(applyFn) {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  textBox.style.transition = 'opacity .18s ease'
  textBox.style.opacity = '0'
  bubbleSwapTimer = setTimeout(function () {
    bubbleSwapTimer = null
    applyFn()
    textBox.style.opacity = '1'
    setTimeout(function () {
      textBox.style.transition = ''
      textBox.style.opacity = ''
    }, 220)
  }, 190)
}
function restoreBubbleLines() {
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  lastHintText = null
  textBox.style.transition = ''
  textBox.style.opacity = ''
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = 'Opencode 用量'
  labelEl.style.color = ''
  amountEl.style.display = ''
  amountEl.className = 'dshwv-amount'
  amountEl.style.color = ''
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.style.color = ''
  render()
}
function showBubble() {
  if (!bubbleOn) return
  if (loginActive) return
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (gifFadeTimer) { clearTimeout(gifFadeTimer); gifFadeTimer = null }
  bubbleShown = true
  bubbleRandomActive = false
  restoreBubbleLines()
  bubbleBox.classList.add('dshwv-bubble-open')
  // 默认展示当前内容；点击气泡切到随机台词段；总时长 5 秒自动关闭
  bubbleTimer = setTimeout(hideBubble, BUBBLE_MS)
}
function hideBubble() {
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  if (bubbleSwapTimer) { clearTimeout(bubbleSwapTimer); bubbleSwapTimer = null }
  if (hintFadeTimer) { clearTimeout(hintFadeTimer); hintFadeTimer = null }
  textBox.style.transition = ''
  textBox.style.opacity = ''
  hintEl.style.transition = ''
  hintEl.style.opacity = ''
  bubbleRandomActive = false
  bubbleRandomLines = null
  bubbleShown = false
  // 只销毁 gif 显示；三行文字保持现状让气泡自然淡出——不能在关闭瞬间
  // 恢复成用量内容（否则随机台词界面会闪现用量数字）。文字恢复交给下次
  // showBubble() 的 restoreBubbleLines()（那时气泡隐藏，恢复过程不可见）。
  bubbleBox.classList.remove('dshwv-bubble-open')
  // gif 靠 CSS opacity 过渡淡出；display:none 会跳过过渡，须等淡出完成再隐藏
  gifFadeTimer = setTimeout(function () {
    gifFadeTimer = null
    gifEl.style.display = 'none'
  }, 240)
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 1280,
    h: window.innerHeight || document.documentElement.clientHeight || 800
  }
}
function rightGap() {
  // 开关关闭：贴边（不避让滚动条）
  if (!scrollGapOn) return 0
  // 开启：用用户填写的像素；填 0 也贴边
  return scrollGapPx > 0 ? scrollGapPx : 0
}
var WINDOW_NAMES = { rolling: '5小时额度', weekly: '本周额度', monthly: '本月额度' }
function fmtPct(p) {
  return isFinite(Number(p)) ? Math.round(Number(p)) + '%' : '--'
}
function percentColor(p) {
  if (p === null || p === undefined || !isFinite(Number(p))) return ''
  if (p >= 90) return '#e0433f'
  if (p >= 60) return '#e0862f'
  return '#2fa24c'
}
function formatReset(sec) {
  if (!isFinite(Number(sec)) || Number(sec) <= 0) return '即将重置'
  var n = Math.round(Number(sec))
  var d = Math.floor(n / 86400)
  var h = Math.floor((n % 86400) / 3600)
  var m = Math.floor((n % 3600) / 60)
  if (d > 0) return d + ' 天 ' + h + ' 小时'
  if (h > 0) return h + ' 小时 ' + m + ' 分'
  if (m > 0) return m + ' 分钟'
  return n + ' 秒'
}
function remainingResetSec(win) {
  if (!win) return 0
  var elapsed = state.fetchedAt ? Math.max(0, (Date.now() - state.fetchedAt) / 1000) : 0
  return Math.max(0, (win.resetInSec || 0) - elapsed)
}
// 按显示窗口模式选出主窗口：auto 取最高（并列时 rolling → weekly → monthly）
function pickMain(w, mode) {
  if (!w) return null
  if (mode === 'rolling' || mode === 'weekly' || mode === 'monthly') {
    var fixed = w[mode]
    return fixed ? { percent: fixed.percent, resetInSec: fixed.resetInSec, kind: mode } : null
  }
  var order = ['rolling', 'weekly', 'monthly']
  var best = null
  var bestPct = -1
  for (var i = 0; i < order.length; i++) {
    var cur = w[order[i]]
    if (cur && cur.percent > bestPct) {
      bestPct = cur.percent
      best = { percent: cur.percent, resetInSec: cur.resetInSec, kind: order[i] }
    }
  }
  return best
}
function mainWindow() {
  return pickMain(state.windows, windowMode)
}
function animateAmount(from, to, duration) {
  if (animId) cancelAnimationFrame(animId)
  if (from === null || !isFinite(from)) from = to
  if (from === to) {
    shown = to
    amountEl.textContent = fmtPct(to)
    return
  }
  var startTime = null
  function step(ts) {
    if (startTime === null) startTime = ts
    var t = Math.min(1, (ts - startTime) / duration)
    var eased = 1 - Math.pow(1 - t, 3)
    amountEl.textContent = fmtPct(from + (to - from) * eased)
    if (t < 1) {
      animId = requestAnimationFrame(step)
    } else {
      animId = null
      shown = to
      amountEl.textContent = fmtPct(to)
    }
  }
  animId = requestAnimationFrame(step)
}
function render() {
  if (loginActive) return
  var amount, hint
  if (state.status === 'error') {
    amount = shown !== null ? fmtPct(shown) : '--'
    hint = state.message ? state.message.slice(0, 16) : '获取失败 · 点击重试'
  } else if (state.percent === null) {
    amount = shown !== null ? fmtPct(shown) : '…'
    hint = '加载中…'
  } else {
    amount = shown !== null ? fmtPct(shown) : fmtPct(state.percent)
    var main = mainWindow()
    hint = main
      ? WINDOW_NAMES[main.kind] + ' ' + main.percent + '% · ' + formatReset(remainingResetSec(main)) + '后重置'
      : 'Opencode Go 用量'
  }
  amountEl.textContent = amount
  amountEl.style.color = percentColor(state.percent)
  if (bubbleRandomActive && bubbleRandomLines) {
    applyBubbleLines(bubbleRandomLines)
  } else {
    setHint(hint)
  }
}
function express() {
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.left = state.left + 'px'
  root.style.top = state.top + 'px'
  root.classList.toggle('dshwv-left', state.h === 'left')
}
function settle() {
  var vp = viewport()
  var w = root.offsetWidth || root.getBoundingClientRect().width || 0
  var h = root.offsetHeight || root.getBoundingClientRect().height || 0
  if (drag && drag.active) {
    // mid-drag resize: keep the pointer-follow position, just clamp into view
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()))
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
    express()
    return
  }
  if (state.h === 'right') {
    state.left = Math.max(0, vp.w - w - state.hOff - rightGap())
  } else if (state.h === 'left') {
    state.left = state.hOff
  } else {
    state.left = clamp(state.left, 0, Math.max(0, vp.w - w - rightGap()))
  }  if (state.v === 'bottom') {
    state.top = Math.max(0, vp.h - h - state.vOff)
  } else if (state.v === 'top') {
    state.top = state.vOff
  } else {
    state.top = clamp(state.top, 0, Math.max(0, vp.h - h))
  }
  express()
}
function refresh(manual) {
  if (busy) return
  busy = true
  if (animDelayTimer) { clearTimeout(animDelayTimer); animDelayTimer = null }
  if (manual || state.percent === null) { state.status = 'loading'; render() }
  var ctrl = null
  var timer = null
  try {
    ctrl = new AbortController()
    timer = setTimeout(function () { try { ctrl.abort() } catch (err) {} }, FETCH_TIMEOUT_MS)
  } catch (err) {}
  fetch(BALANCE_URL, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (r) { return r.json() })
    .then(function (data) {
      if (data && data.ok) {
        var w = data.windows || null
        var main = pickMain(w, windowMode)
        var np = main ? main.percent : null
        var changed = state.percent !== null && np !== null && np !== state.percent
        state.windows = w
        state.percent = np
        state.kind = main ? main.kind : 'auto'
        state.fetchedAt = Date.now()
        state.message = ''
        if (changed) {
          if (!manual) {
            showBubble()
            state.status = 'changing'
            // usage-change bubble: wait 0.3s after it floats out, then roll the number
            if (animDelayTimer) clearTimeout(animDelayTimer)
            animDelayTimer = setTimeout(function () {
              animDelayTimer = null
              animateAmount(shown, np, ANIM_MS)
            }, 300)
            if (settleTimer) clearTimeout(settleTimer)
            settleTimer = setTimeout(function () {
              settleTimer = null
              if (state.status === 'changing') { state.status = 'ok'; render() }
            }, CHANGE_MS + 300)
          } else {
            animateAmount(shown, np, ANIM_MS)
            state.status = 'ok'
            render()
          }
        } else {
          if (animId === null) shown = np
          state.status = 'ok'
          render()
        }
      } else {
        state.status = 'error'
        var msg = (data && data.error) ? String(data.error) : '获取失败'
        state.message = msg.indexOf('未配置凭据') !== -1 ? '未配置凭据 · 点菜单登录' : msg
        render()
      }
    })
    .catch(function () {
      state.status = 'error'
      state.message = '获取失败'
      render()
    })
    .finally(function () {
      busy = false
      if (timer) clearTimeout(timer)
    })
}
var soundOn = true
var soundVol = 0.9
var soundSet = 'duck'
var windowMode = 'auto'
var bubbleOn = true
var scrollGapOn = false
var scrollGapPx = 17
function saveConfig() {
  try {
    fetch(SIZE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scale: state.scale, sound: soundOn, vol: soundVol, soundSet: soundSet, windowMode: windowMode, bubbleOn: bubbleOn, scrollGapOn: scrollGapOn, scrollGapPx: scrollGapPx }) })
    // 锚点位置记忆：记录相对边框的离边距离，窗口 resize 后保持（localStorage）。
    // v:2 = 净距离格式（剥离避让距离），v:1 旧格式含避让距离，恢复时废弃旧格式。
    var vp = viewport()
    var w = root.offsetWidth || root.getBoundingClientRect().width || 0
    var h = root.offsetHeight || root.getBoundingClientRect().height || 0
    var leftDist = state.left
    var rightDist = vp.w - state.left - w
    var topDist = state.top
    var bottomDist = vp.h - state.top - h
    var hAnchor = leftDist <= rightDist ? 'left' : 'right'
    var hDistRaw = Math.round(Math.min(leftDist, rightDist))
    var hDist = hAnchor === 'right' && scrollGapOn ? Math.max(0, hDistRaw - rightGap()) : hDistRaw
    localStorage.setItem('dshw-pos', JSON.stringify({
      v: 2,
      hAnchor: hAnchor,
      hDist: hDist,
      vAnchor: topDist <= bottomDist ? 'top' : 'bottom',
      vDist: Math.round(Math.min(topDist, bottomDist))
    }))
  } catch (err) {}
}
function setWindowMode(v) {
  windowMode = v === 'rolling' || v === 'weekly' || v === 'monthly' ? v : 'auto'
  windowSelect.value = windowMode
  saveConfig()
  refresh(false)
}
function setBubbleOn(v) {
  bubbleOn = !!v
  bubbleToggle.checked = bubbleOn
  saveConfig()
}
// —— OpenCode 登录（设备码流程：宿主开默认浏览器，这里轮询状态）——
var loginActive = false
var loginPollTimer = null
function startLogin() {
  fetch('/dsh-whale/login/start', { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (!d || !d.ok) {
        showLoginMessage('登录失败', d && d.error ? String(d.error).slice(0, 40) : '网络错误')
        return
      }
      loginActive = true
      bubbleRandomActive = false
      bubbleShown = true
      lastHintText = null
      if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
      gifEl.style.display = 'none'
      gifEl.style.opacity = ''
      labelEl.style.display = ''
      labelEl.className = 'dshwv-label'
      labelEl.textContent = 'OpenCode 登录'
      labelEl.style.color = ''
      amountEl.style.display = ''
      amountEl.className = 'dshwv-amount'
      amountEl.textContent = d.userCode
      amountEl.style.color = '#3b82f6'
      hintEl.style.display = ''
      hintEl.className = 'dshwv-hint'
      hintEl.textContent = d.browserOpened === false
        ? '打开 ' + d.url + ' 输入上方验证码'
        : '已在默认浏览器打开验证页，输入上方验证码后自动继续…'
      hintEl.style.color = ''
      bubbleBox.classList.add('dshwv-bubble-open')
      pollLogin()
    })
    .catch(function () { showLoginMessage('登录失败', '网络错误') })
}
function pollLogin() {
  if (loginPollTimer) { clearTimeout(loginPollTimer); loginPollTimer = null }
  fetch('/dsh-whale/login/status', { cache: 'no-store' })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (!d) return
      if (d.status === 'pending') {
        loginPollTimer = setTimeout(pollLogin, 5000)
        return
      }
      if (d.status === 'done') {
        clearLoginBubble()
        showLoginMessage('登录成功', d.workspaceID ? '工作区已自动填入' : '凭据已保存')
        state.windows = null
        state.percent = null
        shown = null
        refresh(true)
        return
      }
      if (d.status === 'expired') {
        clearLoginBubble()
        showLoginMessage('登录超时', '验证码已过期，请重新点登录')
        return
      }
      if (d.status === 'denied') {
        clearLoginBubble()
        showLoginMessage('登录被拒绝', '请在浏览器中允许访问后重试')
        return
      }
    })
    .catch(function () {})
}
function clearLoginBubble() {
  loginActive = false
  if (loginPollTimer) { clearTimeout(loginPollTimer); loginPollTimer = null }
  hideBubble()
}
function showLoginMessage(title, text) {
  loginActive = true
  bubbleRandomActive = false
  bubbleShown = true
  lastHintText = null
  if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  gifEl.style.display = 'none'
  gifEl.style.opacity = ''
  labelEl.style.display = ''
  labelEl.className = 'dshwv-label'
  labelEl.textContent = title
  labelEl.style.color = ''
  amountEl.style.display = 'none'
  amountEl.textContent = ''
  hintEl.style.display = ''
  hintEl.className = 'dshwv-hint'
  hintEl.textContent = text
  hintEl.style.color = ''
  bubbleBox.classList.add('dshwv-bubble-open')
  bubbleTimer = setTimeout(function () { clearLoginBubble() }, 5000)
}
function doLogout() {
  fetch('/dsh-whale/login/logout', { cache: 'no-store' })
    .then(function () {
      state.windows = null
      state.percent = null
      shown = null
      state.status = 'error'
      state.message = '已登出'
      render()
      refresh(true)
    })
    .catch(function () {})
}
function setScrollGapOn(v) {
  scrollGapOn = !!v
  scrollGapToggle.checked = scrollGapOn
  scrollGapInput.disabled = !scrollGapOn
  saveConfig()
  settle()
}
function setScrollGapPx(v) {
  if (!scrollGapOn) return
  var n = Math.max(0, Math.round(Number(v) || 0))
  scrollGapPx = n
  scrollGapInput.value = String(n)
  saveConfig()
  settle()
}
function scaleToDisplay(s) {
  return Math.round((s - MIN_SCALE) / ((MAX_SCALE - MIN_SCALE) / 19)) + 1
}
function setScale(v) {
  var next = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(v))) * 10) / 10
  // 缩放测量需要 left/top 立即到位：临时禁用过渡（滚轮/数字框路径没有
  // 滑块 pointerdown 的 transition:none，否则 r2 测的是过渡起点导致错锚点）
  var prevTrans = root.style.transition
  root.style.transition = 'none'
  var rect = root.getBoundingClientRect()
  // fixed point: the whale's corner — bottom-right when unflipped, bottom-left
  // when flipped. Growing extends the widget up-left / up-right from that
  // corner; shrinking pulls it back toward the corner. The whale always hugs
  // its corner while scaling.
  var fx = state.h === 'left' ? rect.left : rect.right
  var fy = rect.bottom
  state.scale = next
  root.style.setProperty('--dshw-scale', String(next))
  scaleInput.value = String(next)
  scaleNumber.value = String(scaleToDisplay(next))
  saveConfig()
  // keep the corner fixed while resizing; the position correction applies
  // instantly because the caller disables the transition for the whole drag
  var r2 = root.getBoundingClientRect()
  var vp = viewport()
  if (state.h === 'left') {
    state.left = Math.min(Math.max(fx, 0), Math.max(0, vp.w - r2.width))
  } else {
    state.left = Math.min(Math.max(fx - r2.width, 0), Math.max(0, vp.w - r2.width))
  }
  state.top = Math.min(Math.max(fy - r2.height, 0), Math.max(0, vp.h - r2.height))
  express()
  // 恢复过渡必须延迟到下一帧：本帧 left/top 已在 none 下设置并提交，
  // 立即恢复会让浏览器对「刚改过的 left/top」重新评估并播放过渡动画
  // （翻转时叠加 transform .3s 更明显，表现为抽搐）。
  requestAnimationFrame(function () {
    root.style.transition = prevTrans
  })
}
function setVol(v) {
  var next = Math.round(Math.min(1, Math.max(0, Number(v))) * 100) / 100
  soundVol = next
  soundOn = next > 0
  volInput.value = String(next)
  volPct.textContent = Math.round(next * 100) + '%'
  try {
    if (pressAudio) pressAudio.volume = next
    if (releaseAudio) releaseAudio.volume = next
  } catch (err) {}
  saveConfig()
}
function setSoundSet(v) {
  soundSet = v === 'fx1' ? 'fx1' : 'duck'
  soundSelect.value = soundSet
  applySoundSet()
  saveConfig()
}
var SQUISH = 'scaleY(0.88) scaleX(1.05)'
var pressAudio = null
var releaseAudio = null
var pressing = false
var pressEnded = false
var releasePlayed = false
var releaseTimer = null
function applySoundSet() {
  try {
    pressAudio = new Audio('/dsh-whale/sound/press.mp3?set=' + soundSet)
    pressAudio.preload = 'auto'
    pressAudio.volume = soundVol
    releaseAudio = new Audio('/dsh-whale/sound/release.mp3?set=' + soundSet)
    releaseAudio.preload = 'auto'
    releaseAudio.volume = soundVol
  } catch (err) {}
}
function playPress() {
  if (!pressAudio || !soundOn) return
  try {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null }
    if (releaseAudio) {
      releaseAudio.pause()
      releaseAudio.currentTime = 0
    }
    pressEnded = false
    releasePlayed = false
    pressAudio.onended = function () {
      pressEnded = true
      // fallback (duration unknown): click → Ya2 right after Ya1 ends
      if (!pressing && !releasePlayed) playRelease()
      // hold: still pressed → wait for pressUp()
    }
    pressAudio.currentTime = 0
    var p = pressAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function playRelease() {
  if (releasePlayed || !releaseAudio || !soundOn) return
  releasePlayed = true
  try {
    releaseAudio.currentTime = 0
    var p = releaseAudio.play()
    if (p && typeof p.catch === 'function') p.catch(function () {})
  } catch (err) {}
}
function pressDown() {
  body.style.transform = SQUISH
  pressing = true
  playPress()
}
function pressUp() {
  body.style.transform = 'scaleY(1) scaleX(1)'
  pressing = false
  if (pressEnded) {
    // hold (or released after Ya1 finished) → Ya2 now
    playRelease()
    return
  }
  // click: start Ya2 in the last 100ms of Ya1's playback
  var durKnown = false
  var remainMs = 0
  try {
    var dur = pressAudio ? pressAudio.duration : 0
    if (isFinite(dur) && dur > 0) {
      durKnown = true
      remainMs = (dur - pressAudio.currentTime) * 1000
    }
  } catch (err) {}
  if (durKnown) {
    releaseTimer = setTimeout(function () {
      releaseTimer = null
      playRelease()
    }, Math.max(0, remainMs - 100))
  }
  // duration unknown → pressAudio.onended fallback plays Ya2 after Ya1 ends
}
var menuOpen = false
function toggleMenu() {
  menuOpen = !menuOpen
  if (menuOpen) positionMenu()
  menuBox.classList.toggle('dshwv-menu-open', menuOpen)
  if (menuOpen) menuBtn.classList.add('dshwv-menu-btn-visible')
}
function closeMenu() {
  menuOpen = false
  menuBox.classList.remove('dshwv-menu-open')
  root.style.transition = ''
  snapCheck()
}
function snapCheck() {
  var rect = root.getBoundingClientRect()
  var vp = viewport()
  var w = rect.width, h = rect.height
  var left = rect.left, top = rect.top
  var centerX = left + w / 2
  var centerY = top + h / 2
  var moved = false
  if (centerX < vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
    left = 0
    moved = true
  } else if (centerX > vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
    left = vp.w - w - rightGap()
    moved = true
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
    top = 0
    moved = true
  } else {
    state.v = 'bottom'
    state.vOff = Math.max(0, vp.h - top - h)
  }
  if (moved) {
    state.left = left
    state.top = top
    settle()
  }
}
function positionMenu() {
  try {
    var r = root.getBoundingClientRect()
    var b = menuBtn.getBoundingClientRect()
    var vp = viewport()
    var onLeft = r.left + r.width / 2 < vp.w / 2
    // the menu appears ABOVE the button, anchored to its side:
    // right side → menu bottom-right aligns with the button's top-right;
    // left side → menu bottom-left aligns with the button's top-left
    if (onLeft) {
      menuBox.style.left = b.left + 'px'
      menuBox.style.right = 'auto'
      menuBox.style.transformOrigin = 'bottom left'
    } else {
      menuBox.style.right = (vp.w - b.right) + 'px'
      menuBox.style.left = 'auto'
      menuBox.style.transformOrigin = 'bottom right'
    }
    menuBox.style.bottom = (vp.h - b.top) + 'px'
    menuBox.style.top = 'auto'
  } catch (err) {}
}

var hitCanvas = null
var hitReady = false
function setupHitTest() {
  try {
    hitCanvas = document.createElement('canvas')
    hitCanvas.width = 610
    hitCanvas.height = 610
    var probe = new Image()
    probe.onload = function () {
      try {
        // 拉伸到 610×610 与 isWhaleHit 的坐标映射对齐；不指定尺寸会按原图大小绘制，
        // 回退到非 610×610 素材（如 DSniang02.png）时命中区域会错位
        hitCanvas.getContext('2d').drawImage(probe, 0, 0, 610, 610)
        hitReady = true
      } catch (err) {}
    }
    probe.onerror = function () {}
    probe.src = IMG_URL
  } catch (err) {}
}
function isWhaleHit(e) {
  if (!hitCanvas || !hitReady) return true
  try {
    var r = img.getBoundingClientRect()
    if (!r || r.width <= 0 || r.height <= 0) return false
    var lx = (e.clientX - r.left) / r.width * 610
    var ly = (e.clientY - r.top) / r.height * 610
    if (lx < 0 || ly < 0 || lx >= 610 || ly >= 610) return false
    if (state.h === 'left') lx = 610 - lx
    var data = hitCanvas.getContext('2d').getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data
    return data[3] > 10
  } catch (err) {
    return true
  }
}
function onDocPointerDown(e) {
  if (e.target && e.target.closest) {
    if (e.target.closest('.dshwv-bubble') || e.target.closest('.dshwv-menu') || e.target.closest('.dshwv-menu-btn')) return
  }
  if (menuOpen) {
    closeMenu()
    return
  }
  if (e.button !== 0 && e.pointerType === 'mouse') return
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
  var vp = viewport()
  var rect = root.getBoundingClientRect()
  drag = { active: true, startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, moved: false, vp: vp }
  root.classList.add('dshwv-dragging')
  pressDown()
  setWidgetCursor('grabbing')
  document.addEventListener('pointermove', onDocPointerMove, true)
  document.addEventListener('pointerup', onDocPointerUp, true)
  document.addEventListener('pointercancel', onDocPointerCancel, true)
}
function onDocPointerMove(e) {
  if (!drag || !drag.active) return
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  if (dx * dx + dy * dy >= CLICK_SQ) drag.moved = true
  // Keep the pre-drag flip orientation while dragging (state.h/v stay as they
  // were); on release endDrag() recomputes the anchors and settle() flips the
  // class with a smooth transition instead of reverting instantly.
  state.left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  state.top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  express()
}
function onDocPointerUp(e) {
  // 拦截鲸鱼区域内的 pointerup：防止下方元素（如文件行）监听 pointerup 穿透误触发
  try { if (isWhaleHit(e)) { e.preventDefault(); e.stopPropagation() } } catch (err) {}
  endDrag(e, true)
}
function onDocPointerCancel(e) { endDrag(e, false) }
function onDocClickStopper(e) {
  // 只在鲸鱼命中区域拦截 click（保持透明区 pass-through）。
  // 持久注册（不随 endDrag 移除）——click 在 pointerup 之后派发，
  // 若在 endDrag 移除会导致 click 穿透到下方元素（如误打开文件）。
  if (!isWhaleHit(e)) return
  try { e.preventDefault(); e.stopPropagation() } catch (err) {}
}
document.addEventListener('pointerdown', onDocPointerDown, true)
document.addEventListener('click', onDocClickStopper, true)

var widgetCursor = ''
function setWidgetCursor(v) {
  if (v !== widgetCursor) {
    widgetCursor = v
    try { document.body.style.cursor = v } catch (err) {}
  }
}
function onDocPointerMoveCursor(e) {
  if (drag && drag.active) { setWidgetCursor('grabbing'); return }
  var el = null
  try { el = document.elementFromPoint(e.clientX, e.clientY) } catch (err) {}
  if (el && el.closest && (el.closest('.dshwv-bubble') || el.closest('.dshwv-menu') || el.closest('.dshwv-menu-btn'))) {
    setWidgetCursor('')
    menuBtn.classList.add('dshwv-menu-btn-visible')
    return
  }
  var over = isWhaleHit(e)
  setWidgetCursor(over ? 'grab' : '')
  menuBtn.classList.toggle('dshwv-menu-btn-visible', over || menuOpen)
}
document.addEventListener('pointermove', onDocPointerMoveCursor, true)

function endDrag(e, clickAllowed) {
  if (!drag || !drag.active) return
  drag.active = false
  document.removeEventListener('pointermove', onDocPointerMove, true)
  document.removeEventListener('pointerup', onDocPointerUp, true)
  document.removeEventListener('pointercancel', onDocPointerCancel, true)
  pressUp()
  root.classList.remove('dshwv-dragging')
  setWidgetCursor(isWhaleHit(e) ? 'grab' : '')
  if (clickAllowed && !drag.moved) { showBubble(); refresh(true); return }
  var dx = e.clientX - drag.startX
  var dy = e.clientY - drag.startY
  var left = clamp(drag.origLeft + dx, 0, Math.max(0, drag.vp.w - drag.w))
  var top = clamp(drag.origTop + dy, 0, Math.max(0, drag.vp.h - drag.h))
  var centerX = left + drag.w / 2
  var centerY = top + drag.h / 2
  if (centerX < drag.vp.w / 4) {
    state.h = 'left'
    state.hOff = 0
  } else if (centerX > drag.vp.w * 3 / 4) {
    state.h = 'right'
    state.hOff = 0
  } else {
    state.h = null
    state.hOff = left
  }
  if (centerY < drag.vp.h / 4) {
    state.v = 'top'
    state.vOff = 0
  } else if (centerY > drag.vp.h * 3 / 4) {
    state.v = 'bottom'
    state.vOff = 0
  } else {
    state.v = null
    state.vOff = top
  }
  state.left = left
  state.top = top
  settle()
  // 拖拽结束立即保存锚点位置（否则刷新/关闭后位置回退到上次改菜单时）
  saveConfig()
}
// 窗口尺寸变化时：自由位置的鲸鱼按相对边框锚点重算（保持离边距离，窗口恢复原状即回原位）；
// 贴边吸附的鲸鱼走 settle()（保持贴边）
function applyAnchorPos() {
  try {
    var a = JSON.parse(localStorage.getItem('dshw-pos') || 'null')
    if (!a || a.v !== 2 || (a.hAnchor !== 'left' && a.hAnchor !== 'right') || typeof a.hDist !== 'number' ||
        (a.vAnchor !== 'top' && a.vAnchor !== 'bottom') || typeof a.vDist !== 'number') return false
    var vp = viewport()
    var w = root.offsetWidth || root.getBoundingClientRect().width || 0
    var h = root.offsetHeight || root.getBoundingClientRect().height || 0
    // 与加载恢复一致：锚点存净距离，右锚点按当前避让开关叠加
    var effectiveRightDist = a.hAnchor === 'right' ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist
    var l = a.hAnchor === 'left' ? a.hDist : vp.w - effectiveRightDist - w
    var t = a.vAnchor === 'top' ? a.vDist : vp.h - a.vDist - h
    state.left = clamp(l, 0, Math.max(0, vp.w - w))
    state.top = clamp(t, 0, Math.max(0, vp.h - h))
    state.h = a.hAnchor
    state.hOff = 0
    state.v = a.vAnchor
    state.vOff = 0
    express()
    return true
  } catch (err) { return false }
}
window.addEventListener('resize', function () {
  if (state.h === null && state.v === null && applyAnchorPos()) return
  settle()
})

var rect0 = root.getBoundingClientRect()
state.left = rect0.left
state.top = rect0.top
express()
render()
applySoundSet()
setupHitTest()
fetch(SIZE_URL, { cache: 'no-store' })
  .then(function (r) { return r.json() })
  .then(function (d) {
    if (d && typeof d.scale === 'number' && d.scale >= MIN_SCALE - 0.1 && d.scale <= MAX_SCALE + 0.1) {
      state.scale = d.scale
      root.style.setProperty('--dshw-scale', String(d.scale))
      scaleInput.value = String(d.scale)
      scaleNumber.value = String(scaleToDisplay(d.scale))
      settle()
    }
    if (d && typeof d.vol === 'number') {
      soundVol = d.vol
      soundOn = soundVol > 0
      volInput.value = String(soundVol)
      volPct.textContent = Math.round(soundVol * 100) + '%'
      try {
        if (pressAudio) pressAudio.volume = soundVol
        if (releaseAudio) releaseAudio.volume = soundVol
      } catch (err) {}
    }
    if (d && typeof d.soundSet === 'string') {
      soundSet = d.soundSet === 'fx1' ? 'fx1' : 'duck'
      soundSelect.value = soundSet
      applySoundSet()
    }
    if (d && typeof d.windowMode === 'string') {
      windowMode = d.windowMode === 'rolling' || d.windowMode === 'weekly' || d.windowMode === 'monthly' ? d.windowMode : 'auto'
      windowSelect.value = windowMode
    }
    if (d && typeof d.bubbleOn === 'boolean') {
      bubbleOn = d.bubbleOn
      bubbleToggle.checked = bubbleOn
    }
    if (d && typeof d.scrollGapOn === 'boolean') {
      scrollGapOn = d.scrollGapOn
      scrollGapToggle.checked = scrollGapOn
      scrollGapInput.disabled = !scrollGapOn
    }
    if (d && typeof d.scrollGapPx === 'number') {
      scrollGapPx = d.scrollGapPx > 0 ? Math.round(d.scrollGapPx) : 0
      scrollGapInput.value = String(scrollGapPx)
    }
    // 相对边框恢复（localStorage 锚点）：窗口变化后保持离边距离。
    // 仅认 v:2 净距离格式；旧格式（含避让距离）废弃，挂件保持默认右下角吸附。
    // 恢复时还原吸附状态（hAnchor/vAnchor → state.h/v），避免挂件变自由位置
    // 导致避让调节不实时（settle 自由分支只 clamp 不重算位置）。
    try {
      var a = JSON.parse(localStorage.getItem('dshw-pos') || 'null')
      if (a && a.v === 2 && (a.hAnchor === 'left' || a.hAnchor === 'right') && typeof a.hDist === 'number' &&
          (a.vAnchor === 'top' || a.vAnchor === 'bottom') && typeof a.vDist === 'number') {
        var vpA = viewport()
        var wA = root.offsetWidth || root.getBoundingClientRect().width || 0
        var hA = root.offsetHeight || root.getBoundingClientRect().height || 0
        // 锚点存的是净距离：右锚点按当前避让开关叠加避让距离
        var effectiveRightDist = a.hAnchor === 'right' ? a.hDist + (scrollGapOn ? rightGap() : 0) : a.hDist
        var lA = a.hAnchor === 'left' ? a.hDist : vpA.w - effectiveRightDist - wA
        var tA = a.vAnchor === 'top' ? a.vDist : vpA.h - a.vDist - hA
        state.left = clamp(lA, 0, Math.max(0, vpA.w - wA))
        state.top = clamp(tA, 0, Math.max(0, vpA.h - hA))
        // 按锚点还原吸附状态（贴边锚点 → 吸附；自由位锚点 → 自由）
        state.h = a.hAnchor
        state.hOff = 0
        state.v = a.vAnchor
        state.vOff = 0
        settle()
      }
    } catch (err) {}
    refresh(false)
  })
  .catch(function () { refresh(false) })
setInterval(function () { refresh(false) }, REFRESH_MS)
})()`


const name = 'whale-balance-widget'
const inject = ['webServer', 'credentials']

function apply(ctx) {
    let imageBytes = null
    let usageCache = null
    let usageInFlight = null
    let gifBytes = null
    const disposers = []

    function loadGif() {
      if (gifBytes) return gifBytes
      for (const p of RUA_GIF_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            gifBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('rua gif not found')
    }

    function loadImage() {
      if (imageBytes) return imageBytes
      for (const p of IMAGE_CANDIDATES) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) {
            imageBytes = bytes
            return bytes
          }
        } catch (err) {}
      }
      throw new Error('whale image not found')
    }

    // —— OpenCode Go 用量页 SSR HTML 解析（逻辑对齐 UsageBar / v587d/pi-ocgo-usage，MIT）——
    function parseUsageHtml(html) {
      const out = { rolling: null, weekly: null, monthly: null }
      const itemRe = /<div[^>]*data-slot="usage-item"/g
      const starts = []
      let m
      while ((m = itemRe.exec(html))) starts.push(m.index)
      if (starts.length === 0) return out
      const blocks = []
      for (let i = 0; i < starts.length; i++) {
        blocks.push(html.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : html.length))
      }
      const capture = (re, text) => {
        const mm = re.exec(text)
        return mm ? mm[1] : null
      }
      // 兼容中英文 label：滚动/Rolling、每周/Weekly、每月/Monthly
      const kindFromLabel = (label) => {
        const lower = String(label || '').toLowerCase()
        if (lower.startsWith('rolling') || lower.startsWith('滚动')) return 'rolling'
        if (lower.startsWith('weekly') || lower.startsWith('每周')) return 'weekly'
        if (lower.startsWith('monthly') || lower.startsWith('每月')) return 'monthly'
        return null
      }
      // "3 小时 3 分钟" / "3 hours 13 minutes" → 秒
      const parseDurationToSec = (phrase) => {
        const p = String(phrase || '').trim().toLowerCase()
        if (!p) return 0
        const re = /(\d+)\s*(秒|分|分钟|小时|天|周|月|年|second|minute|hour|day|week|month|year)s?/g
        let total = 0
        let matched = false
        let mm
        while ((mm = re.exec(p))) {
          const n = Number(mm[1])
          if (!isFinite(n)) continue
          matched = true
          switch (mm[2]) {
            case '秒': case 'second': total += n; break
            case '分': case '分钟': case 'minute': total += n * 60; break
            case '小时': case 'hour': total += n * 3600; break
            case '天': case 'day': total += n * 86400; break
            case '周': case 'week': total += n * 604800; break
            case '月': case 'month': total += n * 2592000; break
            case '年': case 'year': total += n * 31536000; break
            default: break
          }
        }
        return matched ? total : 0
      }
      for (const block of blocks) {
        const label = capture(/data-slot="usage-label"[^>]*>([^<]+)</, block)
        const pctStr = capture(/data-slot="usage-value"[\s\S]*?<!--\$-->\s*(\d+)\s*<!--\/-->/, block)
        if (label == null || pctStr == null) continue
        const kind = kindFromLabel(label)
        if (!kind) continue
        const resetRaw = capture(/data-slot="reset-time"[^>]*>([\s\S]*?)<\/span>/, block) || ''
        const resetPhrase = resetRaw
          .replace(/<!--[\s\S]*?-->/g, ' ')
          .replace(/^(重置于|Resets in)/, '')
          .replace(/\s+/g, ' ')
          .trim()
        out[kind] = {
          percent: Math.min(100, Math.max(0, Number(pctStr) || 0)),
          resetInSec: parseDurationToSec(resetPhrase),
        }
      }
      return out
    }

    function extractWorkspaceId(text) {
      if (!text) return null
      const m = /wrk_[A-Za-z0-9]{8,}/.exec(String(text))
      return m ? m[0] : null
    }

    function openDefaultBrowser(url) {
      try {
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
        const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
        const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
        child.unref()
        return true
      } catch (err) {
        return false
      }
    }

    // —— 登录状态机（设备码流程，与 opencode CLI 的 client_id=opencode-cli 一致）——
    let pendingLogin = null // { deviceCode, userCode, url, expiresAt, interval, lastPollAt, status }
    async function loginStart() {
      if (pendingLogin && pendingLogin.status === 'pending' && Date.now() < pendingLogin.expiresAt) {
        return { ok: true, ...pendingLogin }
      }
      let res
      try {
        res = await fetch(OPENCODE_CONSOLE_URL + '/auth/device/code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ client_id: DEVICE_CLIENT_ID }),
          signal: AbortSignal.timeout(15000),
        })
      } catch (err) {
        return { ok: false, error: '设备码请求失败: ' + String((err && err.message) || err).slice(0, 160) }
      }
      if (!res.ok) return { ok: false, error: '设备码请求失败: HTTP ' + res.status }
      let data
      try { data = await res.json() } catch (err) { return { ok: false, error: '设备码响应解析失败' } }
      const expiresIn = Number(data.expires_in) || 900
      const interval = Number(data.interval) || 5
      const verification = String(data.verification_uri_complete || data.verification_uri || '')
      const url = verification.startsWith('http')
        ? verification
        : OPENCODE_BASE_URL + (verification.startsWith('/') ? verification : '/' + verification)
      pendingLogin = {
        deviceCode: String(data.device_code || ''),
        userCode: String(data.user_code || ''),
        url: url,
        expiresAt: Date.now() + expiresIn * 1000,
        interval: Math.max(3, Math.min(30, interval)),
        lastPollAt: 0,
        status: 'pending',
      }
      const opened = openDefaultBrowser(url)
      return { ok: true, userCode: pendingLogin.userCode, url: url, expiresIn: expiresIn, browserOpened: opened }
    }

    async function loginPoll() {
      if (!pendingLogin || pendingLogin.status !== 'pending') {
        return { ok: true, status: 'none' }
      }
      if (Date.now() >= pendingLogin.expiresAt) {
        pendingLogin.status = 'expired'
        return { ok: true, status: 'expired' }
      }
      if (Date.now() - pendingLogin.lastPollAt < pendingLogin.interval * 1000) {
        return { ok: true, status: 'pending', userCode: pendingLogin.userCode }
      }
      pendingLogin.lastPollAt = Date.now()
      let res
      try {
        res = await fetch(OPENCODE_CONSOLE_URL + '/auth/device/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: pendingLogin.deviceCode,
            client_id: DEVICE_CLIENT_ID,
          }),
          signal: AbortSignal.timeout(15000),
        })
      } catch (err) {
        return { ok: true, status: 'pending', userCode: pendingLogin.userCode }
      }
      let data
      try { data = await res.json() } catch (err) {
        return { ok: true, status: 'pending', userCode: pendingLogin.userCode }
      }
      if (data && data.access_token) {
        pendingLogin.status = 'done'
        try {
          await ctx.credentials.set('OPENCODE_ACCESS_TOKEN', String(data.access_token))
          await ctx.credentials.set('OPENCODE_REFRESH_TOKEN', String(data.refresh_token || ''))
        } catch (err) {}
        // 尝试从控制台页面自动提取 workspace ID（Bearer 可用时）
        let workspaceID = null
        try {
          const html = await (await fetch(OPENCODE_BASE_URL + '/go', {
            headers: { Authorization: 'Bearer ' + data.access_token, Accept: 'text/html' },
            signal: AbortSignal.timeout(15000),
          })).text()
          workspaceID = extractWorkspaceId(html)
        } catch (err) {}
        if (workspaceID) {
          try { await ctx.credentials.set('OPENCODE_WORKSPACE_ID', workspaceID) } catch (err) {}
        }
        usageCache = null
        return { ok: true, status: 'done', workspaceID: workspaceID }
      }
      const errCode = data && data.error
      if (errCode === 'expired_token') {
        pendingLogin.status = 'expired'
        return { ok: true, status: 'expired' }
      }
      if (errCode === 'access_denied') {
        pendingLogin.status = 'denied'
        return { ok: true, status: 'denied' }
      }
      // authorization_pending / slow_down：继续等待
      return { ok: true, status: 'pending', userCode: pendingLogin.userCode }
    }

    async function loginLogout() {
      pendingLogin = null
      usageCache = null
      for (const ref of ['OPENCODE_ACCESS_TOKEN', 'OPENCODE_REFRESH_TOKEN', 'OPENCODE_COOKIE', 'OPENCODE_WORKSPACE_ID']) {
        try { await ctx.credentials.unset(ref) } catch (err) {}
      }
      return { ok: true }
    }

    async function resolveOpencodeSecrets() {
      const out = { apiKey: null, access: null, cookie: null, workspaceID: null }
      for (const [ref, key] of [['OPENCODE_GO_API_KEY', 'apiKey'], ['OPENCODE_ACCESS_TOKEN', 'access'], ['OPENCODE_COOKIE', 'cookie'], ['OPENCODE_WORKSPACE_ID', 'workspaceID']]) {
        try {
          const cred = await ctx.credentials.resolve(ref)
          if (cred && cred.value) out[key] = String(cred.value).trim()
        } catch (err) {}
      }
      return out
    }

    // 官方 API：GET /zen/go/v1/usage（Bearer OPENCODE_GO_API_KEY）
    async function fetchZenUsage(apiKey) {
      let res
      try {
        res = await fetch(ZEN_USAGE_URL, {
          headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        })
      } catch (err) {
        return { ok: false, code: 'HTTP', transient: true, error: '官方用量接口请求失败: ' + String((err && err.message) || err).slice(0, 160) }
      }
      if (!res.ok) {
        let detail = ''
        try {
          const d = await res.json()
          detail = (d && d.error && d.error.message) ? String(d.error.message) : ''
        } catch (err) {}
        return {
          ok: false,
          code: 'HTTP',
          transient: res.status >= 500,
          error: '官方用量接口 HTTP ' + res.status + (detail ? ' (' + detail + ')' : ''),
        }
      }
      let data
      try {
        data = await res.json()
      } catch (err) {
        return { ok: false, code: 'PARSE', error: '官方用量接口返回异常' }
      }
      const u = data && data.usage
      if (!u || typeof u !== 'object') {
        return { ok: false, code: 'SHAPE', error: '官方用量接口结构异常' }
      }
      const now = Date.now()
      const windows = { rolling: null, weekly: null, monthly: null }
      for (const kind of ['rolling', 'weekly', 'monthly']) {
        const w = u[kind]
        if (!w || typeof w !== 'object') continue
        const pct = Number(w.percent)
        if (!isFinite(pct)) continue
        const resetsMs = Date.parse(String(w.resetsAt || ''))
        windows[kind] = {
          percent: Math.min(100, Math.max(0, Math.round(pct))),
          resetInSec: isFinite(resetsMs) ? Math.max(0, Math.round((resetsMs - now) / 1000)) : 0,
          status: String(w.status || 'ok'),
        }
      }
      if (!windows.rolling && !windows.weekly && !windows.monthly) {
        return { ok: false, code: 'SHAPE', error: '官方用量接口未返回额度窗口（可能需要 OpenCode Go 订阅）' }
      }
      return { ok: true, windows: windows, via: 'api', updatedAt: new Date().toISOString() }
    }

    function parseGoPageResult(html, via) {
      const windows = parseUsageHtml(html)
      if (!windows.rolling && !windows.weekly && !windows.monthly) {
        return {
          ok: false,
          code: 'SHAPE',
          error: '页面解析不到用量（会话可能已过期，请用挂件菜单重新登录，或重新配置 OPENCODE_COOKIE）',
        }
      }
      return { ok: true, windows: windows, via: via, updatedAt: new Date().toISOString() }
    }

    // 抓 workspace/go 页面：Cookie 通道（官方 API 不可用时的兜底）
    async function fetchGoPageHtml(secrets) {
      const workspaceID = secrets.workspaceID
      if (!workspaceID) return { ok: false, code: 'NO_KEY', error: '未配置凭据 OPENCODE_GO_API_KEY / OPENCODE_WORKSPACE_ID' }
      const url = OPENCODE_BASE_URL + '/workspace/' + encodeURIComponent(workspaceID) + '/go'
      const attempts = []
      if (secrets.cookie) {
        attempts.push({ name: 'cookie', headers: { Cookie: secrets.cookie, Accept: 'text/html' } })
      }
      if (attempts.length === 0) {
        return { ok: false, code: 'NO_KEY', error: '未配置凭据：请配置 OPENCODE_GO_API_KEY（推荐，控制台创建）或 OPENCODE_COOKIE' }
      }
      let lastErr = null
      let lastStatus = 0
      for (const attempt of attempts) {
        let res
        try {
          res = await fetch(url, { headers: attempt.headers, signal: AbortSignal.timeout(15000) })
        } catch (err) {
          lastErr = err
          continue
        }
        if (!res.ok) {
          lastErr = new Error('HTTP ' + res.status)
          lastStatus = res.status
          if (res.status < 500) continue // 4xx：换下一通道
          continue
        }
        let html
        try { html = await res.text() } catch (err) { continue }
        return { ok: true, html: html, via: attempt.name }
      }
      const transient = !(lastStatus >= 400 && lastStatus < 500)
      return {
        ok: false,
        code: 'HTTP',
        transient: transient,
        error: '用量请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200),
      }
    }

    async function fetchOpencodeUsage() {
      const secrets = await resolveOpencodeSecrets()
      // 1. 官方 API 优先
      if (secrets.apiKey) {
        const zen = await fetchZenUsage(secrets.apiKey)
        if (zen.ok) return zen
        // 4xx（key 无效/无 Go 订阅）：回落到 Cookie 通道；5xx/网络错误直接返回
        if (!zen.transient) {
          const page = await fetchGoPageHtml(secrets)
          if (page.ok) return parseGoPageResult(page.html, page.via)
          return page
        }
        return zen
      }
      // 2. Cookie 通道
      const page = await fetchGoPageHtml(secrets)
      if (!page.ok) return page
      return parseGoPageResult(page.html, page.via)
    }

    async function getOpencodeUsage() {
      const now = Date.now()
      if (usageCache && now - usageCache.at < USAGE_TTL_MS) {
        return Promise.resolve(usageCache.payload)
      }
      if (usageInFlight) return usageInFlight
      usageInFlight = fetchOpencodeUsage()
        .then((payload) => {
          if (payload.ok) {
            usageCache = { at: now, payload }
            return payload
          }
          if (payload.transient && usageCache) {
            // transient network/API blip: keep serving the last known usage
            return { ...usageCache.payload, stale: true, error: payload.error }
          }
          if (!payload.transient) console.error('[whale-balance]', payload.code, payload.error)
          return payload
        })
        .catch((err) => ({
          ok: false,
          code: 'ERROR',
          error: '用量服务异常: ' + String((err && err.message) || err).slice(0, 200),
        }))
        .finally(() => {
          usageInFlight = null
        })
      return usageInFlight
    }

    function normalizeWindowMode(m) {
      return m === 'rolling' || m === 'weekly' || m === 'monthly' ? m : 'auto'
    }

    function readSizeConfig() {
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'))
          if (parsed && typeof parsed.scale === 'number') {
            return {
              scale: parsed.scale,
              sound: parsed.sound !== false,
              vol: typeof parsed.vol === 'number' ? parsed.vol : 0.9,
              soundSet: parsed.soundSet === 'fx1' ? 'fx1' : 'duck',
              windowMode: normalizeWindowMode(parsed.windowMode),
              bubbleOn: parsed.bubbleOn !== false,
              scrollGapOn: parsed.scrollGapOn === true,
              scrollGapPx: typeof parsed.scrollGapPx === 'number' ? Math.round(parsed.scrollGapPx) : 17,
            }
          }
        } catch (err) {}
      }
      return null
    }

    function writeSizeConfig(scale, sound, vol, soundSet, windowMode, bubbleOn, scrollGapOn, scrollGapPx) {
      const wm = normalizeWindowMode(windowMode)
      const bo = bubbleOn !== false
      const sgo = scrollGapOn === true
      const sgp = typeof scrollGapPx === 'number' && scrollGapPx > 0 ? Math.round(scrollGapPx) : 0
      const body = JSON.stringify({
        scale: scale,
        sound: sound !== false,
        vol: typeof vol === 'number' ? vol : 0.9,
        soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
        windowMode: wm,
        bubbleOn: bo,
        scrollGapOn: sgo,
        scrollGapPx: sgp,
        updatedAt: new Date().toISOString(),
      })
      for (const p of SIZE_FILE_CANDIDATES) {
        try {
          fs.writeFileSync(p, body, 'utf8')
          return {
            ok: true,
            scale: scale,
            sound: sound !== false,
            vol: typeof vol === 'number' ? vol : 0.9,
            soundSet: soundSet === 'fx1' ? 'fx1' : 'duck',
            windowMode: wm,
            bubbleOn: bo,
            scrollGapOn: sgo,
            scrollGapPx: sgp,
          }
        } catch (err) {}
      }
      return { ok: false, error: '无法持久化挂件尺寸' }
    }

    function readBody(req) {
      return new Promise((resolve, reject) => {
        const chunks = []
        let size = 0
        req.on('data', (c) => {
          size += c.length
          if (size > 8192) {
            reject(new Error('body too large'))
            req.destroy()
            return
          }
          chunks.push(c)
        })
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
        req.on('error', reject)
      })
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/image.png',
      handler: (req, res) => {
        try {
          const bytes = loadImage()
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('whale image unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/rua.gif',
      handler: (req, res) => {
        try {
          const bytes = loadGif()
          res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store',
            'Content-Length': String(bytes.length),
          })
          res.end(bytes)
        } catch (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('rua gif unavailable: ' + String((err && err.message) || err))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/balance.json',
      handler: async (req, res) => {
        try {
          const payload = await getOpencodeUsage()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/login/start',
      handler: async (req, res) => {
        try {
          const payload = await loginStart()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/login/status',
      handler: async (req, res) => {
        try {
          const payload = await loginPoll()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/login/logout',
      handler: async (req, res) => {
        try {
          const payload = await loginLogout()
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err).slice(0, 200) }))
        }
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/size.json',
      handler: async (req, res) => {
        if (req.method === 'PUT' || req.method === 'POST') {
          try {
            const body = await readBody(req)
            const parsed = JSON.parse(body)
            const scale = typeof parsed.scale === 'number' ? parsed.scale : null
            if (scale === null) {
              res.writeHead(400, JSON_HEADERS)
              res.end(JSON.stringify({ ok: false, error: 'missing scale' }))
              return
            }
            const result = writeSizeConfig(scale, parsed.sound !== false, parsed.vol, parsed.soundSet, parsed.windowMode, parsed.bubbleOn, parsed.scrollGapOn, parsed.scrollGapPx)
            res.writeHead(result.ok ? 200 : 500, JSON_HEADERS)
            res.end(JSON.stringify(result))
          } catch (err) {
            res.writeHead(400, JSON_HEADERS)
            res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }))
          }
          return
        }
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(readSizeConfig() || {}))
      },
    }))

    function loadSound(candidates) {
      for (const p of candidates) {
        try {
          const bytes = fs.readFileSync(p)
          if (bytes && bytes.length > 0) return bytes
        } catch (err) {}
      }
      return null
    }

    function serveSound(req, res, candidates) {
      const bytes = loadSound(candidates)
      if (!bytes) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('sound unavailable')
        return
      }
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Content-Length': String(bytes.length),
      })
      res.end(bytes)
    }

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/press.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.press)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/sound/release.mp3',
      handler: (req, res) => {
        const set = SOUND_SETS[soundSetFromUrl(req.url)] || SOUND_SETS.duck
        serveSound(req, res, set.release)
      },
    }))

    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-whale/widget.js',
      handler: (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(WIDGET_JS)
      },
    }))

    disposers.push(ctx.webServer.tapIndex((html) => {
      if (html.indexOf('/dsh-whale/widget.js') !== -1) return html
      const tag = '<script defer src="/dsh-whale/widget.js"></script>'
      if (html.indexOf('</body>') !== -1) return html.replace('</body>', tag + '</body>')
      return html + tag
    }))

    ctx.effect(() => () => {
      for (const d of disposers) {
        try { d() } catch (err) {}
      }
    })
}

export { name, inject, apply }
