# DSH 小鲸鱼用量挂件（Opencode Usage Whale Widget）

![DSH 小鲸鱼用量挂件](assets/DSH2.png)

DeepSeek Harness（DSH）Web 界面右下角的常驻用量挂件：小鲸鱼气泡图 + **OpenCode Go 用量额度**（5 小时 / 本周 / 本月，百分比 + 重置倒计时），每次打开界面自动启用。本项目是标准 DSH 插件包，可通过 `dsh plugin` 安装/卸载。

本仓库 fork 自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)，数据源由 DeepSeek 余额接口替换为 OpenCode Go 官方用量接口（`zen/go/v1/usage`），用量展示参考 [sidleo/UsageBar](https://github.com/sidleo/UsageBar)。

## 特性

- 🐋 **常驻自启**：随 DSH Web 界面每次打开自动出现（标准 DSH bundle 插件）
- 📊 **Opencode Go 用量**：直连官方接口 `GET zen/go/v1/usage`（Bearer API key），显示三个额度窗口
  - **5 小时额度**（rolling）/ **本周额度**（weekly）/ **本月额度**（monthly）
  - 主数字默认显示**最高**的窗口（`自动 (最高)`），菜单可切换固定窗口
  - 菜单可切换**已用额度 / 剩余额度**显示（剩余 = 100 − 已用）
  - 数字**滚动动画**；用量变化自动弹气泡
  - 用量颜色分档：< 60% 绿、60–90% 橙、≥ 90% 红（与 UsageBar 一致）
  - 气泡提示行显示「窗口名 已用/剩余 百分比 · X 小时 X 分后重置」，长文本自动换行；瞬时网络抖动自动沿用最近数据不报错
- 🎨 **Opencode 黑灰配色**：气泡、菜单、控件全面黑灰色系（气泡底 #17171b + 浅灰描边与文字）
- 🖱️ **拖拽 + 四边四分之一吸附**（左/右/上/下，角落可组合）
- 🔄 左吸附时整体**水平镜像翻转**（文字同步反向、带动画）
- 🧸 **按压 Q 弹**玩偶效果（按压时底部坐标不变）
- 🎚️ **汉堡菜单**（悬停鲸鱼右上角出现）：大小滑块（0.6–2.5 倍）、音效切换（小黄鸭 / 音效1）、音量调节、显示窗口（自动/5小时/本周/本月）、额度（已用/剩余）、气泡开关、避让滚动条
- 🔊 **音效**：按压/松手音效（可选包内 mp3，缺失时静默降级）
- 💬 **随机台词**：点击气泡切换随机台词段（加权随机，含用量概览/gif 动图/卖萌吐槽），再点一次关闭；气泡总显示 5 秒自动收起
- 📐 随浏览器窗口自动缩放；文字位置/字号与图片联动

## 目录结构

```text
opencode-whale-widget/
├── package.json          # DSH bundle 插件元数据
├── README.md             # 本文件
├── cordis.patch.yml      # 插件挂载声明
├── lib/
│   └── index.js          # 宿主侧插件本体（官方用量 API 客户端）
├── assets/
│   ├── DSH2.png          # README 顶部展示图
│   ├── DSniang1.png      # 小鲸鱼本体（cut-out，气泡由代码绘制）
│   ├── DSniang02.png     # 备用整图（兼容旧版手动安装路径）
│   ├── rua.gif           # 随机台词 gif（可选）
│   ├── Ya1.mp3 / Ya2.mp3 # 小黄鸭音效（可选）
│   └── D1.mp3 / D2.mp3   # 音效1（可选）
└── whale-widget-prompt.md # 上游完整规格/维护提示词（历史文档）
```

## 凭据（安装后必读）

挂件用量数据来自官方接口，需要一个工作区 API Key：

1. 打开 https://opencode.ai/console → 对应工作区 → **Keys** 页面创建 API key（`sk-...` 或 `opencode-...`）
2. 把 key 配置为 DSH 凭据 `OPENCODE_GO_API_KEY`（DSH 凭据服务 / `~/.dsh/.credentials.yaml`）

挂件将直连官方接口 `GET https://opencode.ai/zen/go/v1/usage`，接口返回精确的百分比与重置时间。

注意事项：

- 官方限流：服务端缓存 60 秒才请求一次，不会高频调用

## 安装

### 方式 A：本地安装（推荐，从当前仓库）

在**仓库根目录**（即 `package.json` 所在目录）执行：

```powershell
dsh plugin --profile web add link:.
```

说明：

- `dsh plugin` 会把参数转发给 pnpm，并在成功后自动把 `dsh-whale-widget` 加入 `dsh.profile.bundles`
- **`link:.` 表示链接当前目录**（仓库根目录本身就是插件包）。如果你复制了仓库到别处，用绝对路径：
  ```powershell
  dsh plugin --profile web add link:D:\你的路径\DeepSeek-Balance-Whale-Widget
  ```
- ⚠️ 不要用 `link:.\dsh-whale-widget`——仓库里**没有** `dsh-whale-widget/` 子目录，这样会安装成普通依赖而非插件，重启后挂件不出现
- 安装完成后重启 `dsh web`，再 F5 刷新浏览器
- **如果之后移动了源码目录**，必须重新执行一次 `dsh plugin --profile web add link:.<新路径>`。若提示已存在/冲突，先 `dsh plugin --profile web remove dsh-whale-widget` 再重新 add

### 方式 B：发布到 npm 后安装

```powershell
dsh plugin --profile web add dsh-whale-widget
```

### 给 AI 的安装说明（用 dsh 辅助安装时，直接复制给 AI）

```
请帮我安装插件 dsh-whale-widget（Opencode 用量鲸鱼挂件）。

步骤：
1. 确保 pnpm 可用（没有就先：npm install -g pnpm）
2. 在 Web profile 安装：
   dsh plugin --profile web add dsh-whale-widget
   如果要从本地仓库链接安装（例如本地克隆的仓库根目录），则用：
   dsh plugin --profile web add link:.<仓库绝对路径>
   （注意：仓库根目录就是插件包，不要写成 link:.\dsh-whale-widget 这种带子目录的路径）
3. 如果报 pnpm 阻止构建脚本（allowBuilds 相关），在 C:\Users\<用户名>\.dsh\profiles\web\pnpm-workspace.yaml 的 allowBuilds 下加对应的包 key，然后重跑
4. 重启 dsh web，然后 F5 刷新浏览器

安装后验证：
- dsh --profile web --dump-config 应该能看到 dsh-whale-widget 在 bundles 里
- curl http://127.0.0.1:3080/dsh-whale/balance.json 应返回 200 JSON（含 windows.rolling/weekly/monthly）
- curl http://127.0.0.1:3080/dsh-whale/widget.js 应返回 200 JS

另外请检查 DSH 凭据里是否配置了 OPENCODE_WORKSPACE_ID 与 OPENCODE_COOKIE（没有就提示用户按 README「必需的凭据」配置）。
```

## 卸载

```powershell
dsh plugin --profile web remove dsh-whale-widget
```

## 从上游 DeepSeek 版迁移

如果你之前用的是上游（DeepSeek 余额）版本：

1. 卸载旧版：`dsh plugin --profile web remove dsh-whale-widget`，然后按上面方式安装本仓库
2. 凭据不再需要 `DEEPSEEK_API_KEY` / `DEEPSEEK_PLATFORM_TOKEN`，改配 `OPENCODE_GO_API_KEY`
3. 旧账本文件 `$DSH_HOME/.dshw-usage.json`（鲸鱼记账）已不再使用，可手动删除

## 验证

```powershell
dsh --profile web --dump-config | Select-String -Pattern "whale"

curl http://127.0.0.1:3080/dsh-whale/image.png
curl http://127.0.0.1:3080/dsh-whale/balance.json
curl http://127.0.0.1:3080/dsh-whale/size.json
```

- `/dsh-whale/image.png` → 200 `image/png`
- `/dsh-whale/balance.json` → 200，形如：
  ```json
  {"ok":true,"via":"api","windows":{"rolling":{"percent":34,"resetInSec":12104,"status":"ok"},"weekly":{"percent":13,"resetInSec":543019,"status":"ok"},"monthly":{"percent":49,"resetInSec":2210127,"status":"ok"}},"updatedAt":"..."}
  ```
- `/dsh-whale/size.json` → GET 返回配置；PUT 写入
- 浏览器 F5 后右下角出现挂件

## 常见问题

- **挂件不出现**：确认 `dsh plugin add` 成功；`dsh --profile web --dump-config` 里能看到 `dsh-whale-widget`；重启 `dsh web` 后 F5。
- **图片不显示**：确认 `assets/DSniang1.png` 在插件包内，且没有把旧文件放在 profile 里占用了同名路由。
- **提示「未配置凭据 OPENCODE_GO_API_KEY」**：到 opencode 控制台 Keys 页面创建 API key，配置为 DSH 凭据 `OPENCODE_GO_API_KEY`。
- **提示「官方用量接口 HTTP 4xx」**：API key 无效/已撤销，或工作区没有 OpenCode Go 订阅，请检查 key 与订阅。
- **没有声音**：确认 `assets/*.mp3` 在包内；若不想带音效文件，静默降级为无声音。
- **本地开发改了代码不生效**：使用 `link:` 安装时，修改源码后重启 `dsh web`（ESM 模块缓存）；如果用已发布版本，需要 `npm publish` 新版本后 `dsh plugin --profile web update dsh-whale-widget`。
- **自定义图片**：气泡由代码绘制（SVG），鲸鱼本体为 cut-out PNG，放在右下角 59.45%；换图需保证透明背景 cut-out，否则按 `whale-widget-prompt.md` 调整几何参数。

## 致谢

- **[sidleo/UsageBar](https://github.com/sidleo/UsageBar)**：OpenCode Go 用量展示与颜色分档的参考原型
- **[MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**：上游挂件本体（鲸鱼娘 UI、拖拽、音效）
- **[anomalyco/opencode](https://github.com/anomalyco/opencode)**：Zen 官方 API 与用量接口源码参考

## 开发与维护

- 上游完整规格、视觉参数见 `whale-widget-prompt.md`（历史文档，DeepSeek 版数据链路描述不再适用）。
- 用量抓取逻辑在 `lib/index.js` 的 `fetchZenUsage` / `fetchOpencodeUsage`（官方接口 `GET /zen/go/v1/usage`，Bearer `OPENCODE_GO_API_KEY`）。

## 许可证

本项目基于 **MIT License** 开源，详见 [LICENSE](LICENSE)。
