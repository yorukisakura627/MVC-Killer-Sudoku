# MY_VIBE_CODING · 开发对话记录

本文件记录杀手数独项目从需求到上线的完整 vibe coding 过程，包括用户要求、我的分析、工作内容、细节确认与多轮改进优化。

---

## 阶段 1：需求与设计

### 用户初始需求
- 做一个杀手数独游戏，同一局可同时包含数字约束（Killer 笼和值）与大小约束（相邻格/笼间大小关系）
- 分简单/普通/困难三档，难度越高可用信息越少，但每步填写可由逻辑推导，不能纯猜
- 每局必须有唯一解
- 先给出清晰框架：步骤、技术栈、需准备的资源及准备方式

### 细节确认（用户逐条回复）
| 问题 | 用户答复 |
|------|----------|
| 大小约束语义 | 相邻两格 >/</，且相邻两笼和值比，两种图形表示要有区别 |
| 困难是否允许 0 给定 | 最少 5 个给定数 |
| 笼是否跨 3×3 宫边界 | 允许 |
| 目标平台 | Web 网页 |
| 笼间大小语义 | 笼A数字之和 vs 笼B数字之和 |
| 格间与笼间约束共存 | 可同时出现 |
| 冗余处理（笼A/B和值已知时 A>B 恒成立） | 有大小约束的笼无需给和值（隐藏和值笼） |
| 困难题生成耗时与命中率 | 离线生成题库，每难度 10 题，前端只抽取，加进度提示 |

### 我的设计
- **双求解器**：暴力回溯验证唯一性 + 逻辑求解器验证可推导（输出推理步骤）
- **约束传播引擎**：统一处理行列宫不重复、笼和值、格间大小、笼间大小，循环至不动点
- **隐藏和值笼**：参与笼间约束的笼不显示和值，靠 45 法则或邻接笼推理
- **难度评分**：`maxTechniqueLevel×100 + stepCount×2 + cageCount×3 + ineqCount×2`
- **Canvas 分层渲染**：网格→高亮→笼边→笼标签→大小符号→候选→数字
- **命令模式历史栈**：填值/候选标记封装为 Command，支持撤销/重做
- **离线题库**：Node 脚本预生成，前端按难度抽取，运行时生成作 fallback

---

## 阶段 2：环境准备

### 用户要求
- 让 AI 能自行运行验证，需要什么工具、怎么补充

### 工作内容
- 明确工具链：Node.js + npm、PowerShell 执行策略、git
- 用户操作：安装 Node.js LTS（v24.20.0），以管理员运行 `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
- 运行诊断命令验证环境：Node/npm 可用、依赖已装、`tsc --noEmit` 通过

---

## 阶段 3：编译修复

### 问题
TypeScript 报多处未使用导入错误。

### 修复
- [inequality-sower.ts](src/generator/inequality-sower.ts)：删除未用的 `cagesAdjacent` 导入
- [keyboard.ts](src/input/keyboard.ts)：删除未用的 `InputAction`
- 6 个渲染图层：删除未用的 `View` 导入
- `tsc --noEmit` 通过，0 错误

---

## 阶段 4：测试

### 用户要求
运行测试套件验证求解器、逻辑推理、生成器。

### 发现的 Bug
全给定（81 格）合法谜题被 `hasUniqueSolution` 误判无解——根因是 `layCages` 贪心扩展笼时未检查笼内数字是否重复，导致部分笼含相同数字，`CageConstraint` 传播把重复值格子候选互相删空。测试用 `if (!p) return` 跳过断言掩盖了问题。

### 修复
[cage-builder.ts](src/generator/cage-builder.ts)：`layCages` 扩展时跟踪 `usedDigits`，只把不引入重复的相邻格加入；`mergeSingletons` 合并单格笼时也检查不重复。

### 结果
13 个测试全部通过，生成器三难度均能产出有效题（easy 35给定/normal 18/hard 5）。

---

## 阶段 5：题库生成

### 用户要求
生成离线题库（easy 10 题，后续 normal/hard）。

### 发现的脚本 Bug
[gen-puzzles.ts](scripts/gen-puzzles.ts) 用 `a.slice(7)`/`a.slice(3)` 硬编码索引解析 CLI 参数，`--n=` 前缀长度与切片不符，导致 `Number('=10')=NaN`，题库写成空文件。改用 `a.indexOf('=')` 动态定位。

### 结果
| 难度 | 成功 | 耗时 | 给定数 | 评分 |
|------|------|------|--------|------|
| easy | 10/10 | 0.1s | 35 | 67~84 |
| normal | 10/10 | 0.2s | 18 | 268~435 |
| hard | 6/10 | 147s | 5\~9 | 507\~587（4 题超时熔断，属预期） |

---

## 阶段 6：UI 开发与多轮改进

### 第 1 轮（5 项 UI 改动）
1. 选中格行列宫黄色太浓且遮挡笼边 → 图层顺序调整（高亮移至笼边之下）+ 填充色加 alpha
2. 暂停时增加遮挡层覆盖整个游戏界面（后改为只覆盖表格）
3. 已填数字格输入相同数字 → 删除该数字
4. 大小约束符号放大（三角 size 6 → 随 cellSize 缩放）
5. 增加数字键盘（鼠标点击），撤销/重做/候选模式移入键盘

### 第 2 轮（4 项）
1. 多选拖动：pointer 加 down/move/up，矩形框选发 `selectMany`
2. 有值格输入不同数字 → 原值保留 + 新数字变候选并存（后改为原值降级候选）
3. 暂停遮罩只覆盖表格本体，浅色背景，空格键切换
4. 布局重构：数字键盘与功能键移到表格正下方，左右边缘与表格等宽

### 第 3 轮（3 项）
1. 候选保持模式：有值格输入不同数字时原值降级为候选，与新数字并存；候选删空后才回填确定值（修复"输入第三个数字变成填充"）
2. 多选去边框，仅蓝色填充底色
3. 左侧栏布局：计时上、导航中横排（上一题/随机题/下一题）、难度下横排（简单/普通/困难），与右侧 4×4 键盘等高

### 第 4 轮（1 项）
- 多选从矩形框选改为路径式：只选鼠标实际划过的格子（`dragPath` Set + 直线插值补全）

### 第 5 轮（3 项）
1. 重做按钮改为"重做本题"：有用户输入时激活，点击清空所有用户输入并重置计时
2. 提示功能：easy 5/normal 3/hard 1 次，随机给空格填正确答案（可撤销但不恢复次数）
3. 笼边内缩：与宫线/相邻笼边分离，`inset = max(2, cellSize×6%)`

### 第 6 轮（4 项问题排查）
1. 困难题库打不开 + 普通只有两题 → 根因：`fetch(..., {cache:'force-cache'})` 缓存了早期空文件；改 `cache:'no-store'` + 时间戳
2. 笼红虚线太刺眼 → strokeStyle 加 alpha `88`
3. 隐藏和值笼无需金色"?"标签 → `sum===null` 的笼 `continue` 跳过
4. （渲染视觉硬刷新确认）

### 第 7 轮（3 项）
1. 帮助按钮+弹窗：计时右侧方形"？"按钮，弹窗含版权/简介/玩法/功能
2. 题目全局编号：easy 001-010/normal 011-020/hard 021-026，新增题时按难度区间自动递增（`getGlobalNumber` 累计偏移）
3. "随机题"改为"题目选择"弹窗：三难度各题，每行 5 个按钮显示序号

---

## 阶段 7：部署上线

### 用户要求
让其他人在别的电脑上也能玩。选 GitHub 管理源码 + Netlify 连接仓库自动构建部署。

### 工作内容
- 创建 [netlify.toml](netlify.toml)：`npm run build` + `publish=dist` + `NODE_VERSION=20`
- 确认 [.gitignore](.gitignore) 合理（排除 node_modules/dist）
- `npm run build` 验证通过，dist 含题库 JSON
- 用户安装 Git for Windows 2.55.0

### Git 操作
- `git init` + `git config --local`（用户名 yorukisakura627 + noreply email）
- `git add .` + `git commit -m "初始化杀手数独项目"`（62 文件，commit 2126f7a）
- `git remote add origin` + `git branch -M main`
- 首次 push 被拒（远程有 LICENSE 初始提交，non-fast-forward）
- 用户自行强制 push 覆盖远程（丢失 MIT LICENSE）

### Netlify 部署
- 用户连接 GitHub 仓库，Netlify 自动读 netlify.toml 构建
- 首次验证：站点被 "Team protection" 私有拦截 → 用户改站点保护为公开
- 二次验证（新网址 https://killer-sudoku-sakurayoruki.netlify.app/）：全部通过
  - 站点公开、控制台无错、题库 fetch 200、渲染正常、填数/切难度/提示全 PASS

### LICENSE 补回
- 本地创建 [LICENSE](LICENSE)（MIT，版权 yorukisakura627 2026）
- 提交 commit `b7fef7a`，待 push 到远程恢复

---

## 阶段 8：文档

### 用户要求
- 写 README.md（GitHub 风格，中文）记录工程
- 写 MY_VIBE_CODING 记录本对话全过程
- git commit

### 当前状态
- 线上版可正常游玩：<https://killer-sudoku-sakurayoruki.netlify.app/>
- 待办：移动端 DPR 适配 + 触摸操作（实现计划第 242 行，未做）

---

## 阶段 9：题库扩充 + 约束箭头防重合

### 用户约定
- **push 由用户自理**：AI 只帮忙 commit 到本地，不再执行 `git push`（此前 LICENSE/README/MY_VIBE_CODING 三次提交已由用户手动推上 GitHub）
- **同步文档**：以后项目代码变更需要 commit 时，同步更新 README 和 MY_VIBE_CODING

### 用户反馈：移动端触摸为何可用？
其他人测试发现平板/手机端可正常游玩。经查 [pointer.ts](src/input/pointer.ts#L44-L47)：输入监听用的是 **Pointer Events API**（pointerdown/move/up/cancel），W3C 标准统一了鼠标/触摸/手写笔三种输入——移动端浏览器的触摸手势被自动翻译成 pointer 事件（touchstart→pointerdown 等），Canvas 选格/拖动多选原生可用；数字键盘是 DOM 按钮，点击同样是原生触摸响应。无需额外适配。

### 用户要求
1. 更新题库：简单 +10、普通 +10、困难 +4；简单和普通难度适当增加笼间大小约束
2. 笼间金色箭头偶尔与格间蓝色箭头位置重合难辨认 → 加判断避让，实在不行移到蓝色箭头边上
3. （长期约定）代码变更 commit 时同步更新两个文档

### 我的分析与实现

**题库参数调整**（[difficulty.ts](src/generator/difficulty.ts)）：
| 难度 | cageHiddenRate | cageIneqRange |
|------|----------------|---------------|
| easy | 0 → **0.1**（需隐藏笼才能撒笼间约束） | [0,0] → **[1,2]** |
| normal | 0.1 → **0.15** | [1,2] → **[2,3]** |

**脚本追加模式**（[gen-puzzles.ts](scripts/gen-puzzles.ts)）：新增 `--append` 参数——读取旧题库 JSON 与新结果按 id 去重合并后写回，不覆盖历史题目。

**笼间箭头防重合**（[inequalities.ts](src/render/layers/inequalities.ts)）：
- 新增 `pickCageEndpoints`：枚举两笼所有格对，按「不与 cellIneq 共边优先 → 距离最近优先」排序选端点（引导虚线与三角共用同一选点，视觉一致）
- 极端 fallback（如两单格笼相邻且该边恰有 cellIneq，无干净端点可选）：三角沿引导线法向偏移 0.35 cell，移到蓝色箭头边旁保证不重合

### 题库生成结果
| 难度 | 生成 | 结果 | 评分区间 | 笼间约束数 |
|------|------|------|----------|-----------|
| easy | +10 追加 | 20 题（10 成功） | 67\~84 | 0\~1 对/题 |
| normal | +10 追加 | 20 题（10 成功） | 268\~435 | 0\~2 对/题 |
| hard | +4（跑了两轮）| 10 题（2+2 成功，4 个超时熔断属预期） | 507\~605 | 2\~4 对/题 |

hard 首轮仅成功 2/4（其余超时），补跑一轮又成 2 题，凑齐 +4 要求。三难度 id 去重校验通过，评分均落在本难度带内。

## 待办
- 可选：细粒度移动端体验优化（响应式布局等）；Pointer Events 已保证基本触摸可用

---

## 阶段 10：四难度体系 + 等值约束 + 约束质量优化（分支 feat/expert-equality）

### 用户需求（8 点）
1. 测试反馈普通→困难跨度过大（给定数过少）：新增**专家难度**；评分带改为 普通 200\~400 / 困难 400\~600 / 专家 600+；评分公式需优化
2. 给定数调整：普通 25 / 困难 15 / 专家 6\~10；提示次数按难度递增 5/4/3/2
3. 消除重复无效约束（如单格笼和值与该格给定数重复）
4. 消除作用不大的笼间大小约束：设"隐形弹性约束"——和值差最多 1+N，N 随和值绝对大小从 0 弹到 2\~3
5. 新增**等值约束**（格间 + 笼间），样式与大小约束统一；格间等值穿过两格共用边
6. 笼和值挡候选数 1：去底色、嵌边框、覆盖显示；候选数向中心集中、字号调大、颜色加深
7. 题库重新生成：简单/普通各 20、困难/专家各 10；熔断阈值调高
8. README 中 `~` 被 GitHub 识别为删除线 → 检查转义；用 git tag 管理版本（0.x 规则）

### 细节确认
- 用户问格间等值语义：相邻格等值与"行列宫不重复"矛盾会导致无解 → 确认为**非同行/列/宫的同值格对**，视觉用跨格连线 + 连线中点 `=`
- 版本 tag 规则由用户提供：Major.Minor.Patch，均从 0 起，正式发行前 Major 恒为 0

### 工作内容（分段进行）
**段 1 渲染**：[cage-labels.ts](src/render/layers/cage-labels.ts) 笼和值去底色嵌边框覆盖显示；[candidates.ts](src/render/layers/candidates.ts) 候选数向中心集中 + 字号调大 + 颜色加深

**段 2 四难度体系**：[difficulty.ts](src/generator/difficulty.ts) 新增 expert 参数组；[side-panel.ts](src/ui/side-panel.ts)/[modal.ts](src/ui/modal.ts) 加专家按钮；[game-store.ts](src/state/game-store.ts) 提示数 5/4/3/2；[puzzle-loader.ts](src/puzzle-loader.ts) 全局编号兼容 expert

**段 3 约束质量**：
- 单格笼一律置 `sum=null`（[pipeline.ts](src/generator/pipeline.ts)），消除与给定数的冗余
- 弹性上限 `elasticLimit(minSum) = 1 + min(3, floor(minSum/12))`，笼间大小约束撒播时跳过超限笼对（[cage-builder.ts](src/generator/cage-builder.ts) 定义，[inequality-sower.ts](src/generator/inequality-sower.ts) 使用）
- `markHiddenCages` 改为**可行对优先**：传入解 sol，把"和值差在弹性上限内的相邻笼对"成对隐藏（否则随机隐藏下笼间约束几乎无作用对象，实测 cageIneq≈0）

**段 4 等值约束**：
- [constraint.ts](src/types/constraint.ts) 新增 `CellEquality`/`CageEquality` 类型；[puzzle.ts](src/types/puzzle.ts) Puzzle/PuzzleJson 增 `cellEq`/`cageEq` 字段（JSON 可选，兼容旧题库）
- [constraints.ts](src/solver/constraints.ts) 实现 `CellEqualityConstraint`/`CageEqualityConstraint` 传播；backtrack/logical 求解器接入
- [inequality-sower.ts](src/generator/inequality-sower.ts) 撒播：格间等值选"同值非 peer 格对"（近距离优先，每格至多 1 条）；笼间等值选"和值相等的相邻隐藏笼对"
- [inequalities.ts](src/render/layers/inequalities.ts) 渲染：低透明度虚线连线 + 中点 `=` 符号（格间深蓝、笼间橙，与大小约束同族靠形状区分）；笼间端点复用避让逻辑
- [clue-remover.ts](src/generator/clue-remover.ts) `clonePuzzle` 保留等值字段

**评分重校准**（用户授权"你看着做"）：
- 新增校准脚本 [calibrate-rating.ts](scripts/calibrate-rating.ts)（`--enforce` 开关测真实产出率）
- 实测发现旧公式下 easy/normal 全被纯传播解出（L0/steps=0，评分仅 90~130），普通题大量低于 200 带导致生成熔断
- 对策：① 各档加 `minLevel` 门槛（normal≥1、hard/expert≥3）；② 提高隐藏笼比例（normal 0.35/hard 0.4/expert 0.5）迫使真技巧解题；③ 公式改 `maxLevel×80 + steps×0.8 + cage×3 + 大小×4 + 等值×6 + (81-givens)×1.5 + max(0,20-givens)×10`
- `--enforce` 实测四档全部落带：easy 142\~161 / normal 300\~310 / hard 544\~573 / expert 676\~710；笼间约束恢复 1\~5 个/题
- 13 个测试全部通过，`tsc --noEmit` 0 错误

### 浏览器验证与修复
- 内置浏览器逐项验证：页面加载、四档难度按钮、题目选择弹窗（60 题编号 001~060 连续）、专家题加载、笼和值无底色嵌边框、候选数居中+深灰、提示次数（专家 2 次后按钮禁用）、键盘填数，全部 PASS，console 无错误
- 首轮验证发现专家题画布上看不到 `=` 等值符号（数据里 expert#1 有 cellEq:3/cageEq:1）→ 定位为 [inequalities.ts](src/render/layers/inequalities.ts) `drawEqGlyph` 把两横画共线了（法向偏移写成沿法向排列），视觉上成了"一根短杠"；改为两横沿连线方向偏移 ±gap、各自沿法向延伸后渲染正常
- 复验：橙色笼间 `=`（4 行 1 列附近）与深蓝格间 `=`（3\~6 行）均可见，数量与题库数据吻合

### 题库重生成结果（已落地，commit 0.2.1）
| 难度 | 生成 | 评分区间 | cellIneq 合计 | cageIneq 合计 | 等值约束合计 |
|------|------|----------|---------------|---------------|--------------|
| easy | 20/20 | 138\~165 | 47 | 14 | 0（配置即为 0） |
| normal | 20/20 | 285\~387 | 140 | 34 | 11 |
| hard | 10/10 | 552\~596 | 128 | 25 | 12 |
| expert | 10/10 | 661\~709 | 156 | 35 | 30 |

四档全部落带、无超时熔断（maxTries=40/timeoutMs=60s 下重生成一次通过）、id 无重复。
