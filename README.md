# 杀手数独 · Killer Sudoku

> 融合 Killer 笼和值与大小/等值约束（格间/笼间）的网页数独，四档难度，每题唯一且可逻辑求解。

在线体验：<https://killer-sudoku-sakurayoruki.netlify.app/>

## 特性

- **约束系统**：Killer 笼和值 + 大小关系（相邻格 `>`/`<`、相邻笼和值比）+ 等值关系（格间/笼间 `=`）
- **隐藏和值笼**：参与笼间大小/等值约束的笼不显示和值，靠 45 法则或邻接笼推理得到范围
- **四档难度**：简单（35 给定，5 提示）/ 普通（25 给定，4 提示）/ 困难（15 给定，3 提示）/ 专家（6\~10 给定，2 提示）
- **唯一解 + 逻辑可解**：暴力回溯验证唯一性，逻辑求解器验证每步可推导，不靠猜测
- **约束质量保障**：
  - 单格笼一律不显示和值（与给定数重复属冗余约束）
  - 笼间大小约束带"弹性上限"：和值差超过 `1+N`（N 随和值绝对大小 0→3 递增）的笼对不撒约束，避免"前期就能确认大小关系"的无效约束
  - 隐藏笼优先成对隐藏"和值相近的相邻笼"，保证笼间约束有作用对象
- **离线题库**：easy 20 / normal 20 / hard 10 / expert 10 题，前端按难度抽取，运行时生成作为 fallback
- **大小约束防重合**：笼间金色箭头自动避开格间蓝色箭头的边（换端点选择）；极端情况法向偏移
- **和值标签优化**：笼和值去掉底色、嵌入笼边框显示并覆盖边框，不再遮挡候选数；候选数位置向中心集中、字号调大、颜色加深
- **Canvas 分层渲染**：网格线、高亮、笼边界、笼标签、大小/等值符号、候选、数字等图层按固定顺序绘制
- **命令模式历史栈**：填值/候选标记封装为 Command，支持撤销/重做/重置本题
- **多选拖动**：按住鼠标划过格子批量选中，输入数字同时填入多格（路径式，只选划过的格）
- **候选保持模式**：有值格输入不同数字时，原确定值降级为候选，与新数字并存为候选
- **暂停遮罩**：空格键切换，遮罩仅覆盖表格本体，左右控制栏可见
- **题目选择弹窗 + 全局编号**：四难度题号连续递增（001→），点击任意题号跳转
- **帮助弹窗**：版权、项目简介、玩法、功能介绍

## 玩法

- **目标**：填满 9×9 网格，使每行/列/宫 1-9 不重复，且满足所有 Killer 笼和值与大小/等值约束
- **Killer 笼**：虚线框出的格子组，左上角金标为格内数字之和，笼内数字不重复
- **格间大小**：相邻格间的 `>`/`<` 符号表示两侧数字大小关系
- **笼间大小**：相邻笼间的三角符号表示两笼和值大小关系；此类笼不显示和值（隐藏和值笼）
- **格间等值**：两格间连线中点的 `=` 符号表示两格填相同数字（两格必不同行/列/宫）
- **笼间等值**：相邻笼间的 `=` 符号表示两笼和值相等；此类笼不显示和值
- **操作**：鼠标选格，键盘或右下数字键盘输入；候选模式下数字标为候选；多选拖动批量填值
- **提示**：随机给一个空格填正确答案，次数按难度 5/4/3/2 递减，用完即止；撤销填值不恢复提示次数

## 技术栈

- **TypeScript 5** + **Vite 5**（构建/开发服务器）
- **Vitest**（单元测试）
- **Canvas 2D**（渲染，无框架）
- 原生 DOM（UI 控件）

## 项目结构

```
sudoku/
├── src/
│   ├── generator/      # 题目生成（cage-builder/pipeline/inequality-sower/clue-remover/difficulty/grid-gen）
│   ├── solver/         # 求解器（backtrack/logical/constraints/propagator/candidates/techniques/）
│   ├── render/         # Canvas 渲染（canvas/view/theme/layers/）
│   ├── input/          # 输入（pointer/keyboard/history）
│   ├── state/          # 状态（game-store/persistence）
│   ├── ui/             # UI（side-panel/numpad/modal/hud）
│   └── types/          # 类型定义（cage/constraint/grid/puzzle）
├── public/puzzles/     # 离线题库 JSON（easy/normal/hard/expert）
├── scripts/            # 题库生成脚本 gen-puzzles.ts + 评分校准脚本 calibrate-rating.ts
├── tests/              # 单元测试（solver/logical/generator）
├── netlify.toml        # Netlify 自动构建配置
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

## 开发

### 环境要求

- Node.js 20+

### 安装与运行

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173
```

### 构建

```bash
npm run build        # 产物输出 dist/
npm run preview      # 预览构建产物
```

### 测试

```bash
npm test             # 求解器/逻辑推理/生成器单元测试
```

### 生成离线题库

```bash
npm run gen-puzzles -- --diff=easy   --n=10             # 覆盖生成
npm run gen-puzzles -- --diff=easy   --n=10 --append    # 追加到现有题库（按 id 去重）
```

题库输出到 `public/puzzles/<难度>.json`，前端启动时加载。追加模式不会覆盖历史题目，适合扩充题库。熔断默认 `maxTries=40` / `timeoutMs=60000`，可用 `--maxTries` / `--timeoutMs` 调整。

## 部署

已配置 [netlify.toml](netlify.toml)：Netlify 连接 GitHub 仓库后，每次 `git push` 自动执行 `npm run build` 并发布 `dist/`。

## 难度评分

```
评分 = maxLevel×80 + steps×0.8 + cageCount×3 + 大小约束数×4
     + 等值约束数×6 + (81-givens)×1.5 + max(0, 20-givens)×10
```

- 简单：0\~200（约束传播可解）
- 普通：200\~400（至少需要 naked-single）
- 困难：400\~600（至少需要数对/45 法则级技巧）
- 专家：≥600（6\~10 给定 + 高密度隐藏笼，极稀给定加成拉高分值）

技巧等级：naked/hidden-single=1，cage-combos=2，数对/45 法则=3，X-Wing=5；每档难度设有最低/最高技巧等级门槛，保证档位区分度。

## 许可

[MIT](LICENSE)
