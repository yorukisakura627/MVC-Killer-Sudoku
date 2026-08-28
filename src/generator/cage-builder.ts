import type { Cage } from '@/types/cage';
import type { CellInequality } from '@/types/constraint';

// 笼间大小约束的"弹性上限"（需求4）：大笼和值比小笼最多大 1+N
//   N 随较小和值的绝对大小从 0 弹性增加到 3：和值越小，允许差值越紧
//   目的：避免"小笼填最大数仍小于大笼填最小数"的无效约束——
//   差值过大时约束在解题前期就失去区分作用，变成纯装饰
//   N(minSum) = min(3, floor(minSum/12))：minSum<12 → 0；12~23 → 1；24~35 → 2；≥36 → 3
//   放在本模块供 markHiddenCages（选隐藏笼对）与 inequality-sower（撒约束）共用，
//   保证"隐藏对"与"可撒约束对"的判定标准一致；放在 cage-builder 避免循环依赖
export function elasticLimit(minSum: number): number {
  return 1 + Math.min(3, Math.floor(minSum / 12));
}

// 判断 (a,b) 两格是否恰好是某条格间大小约束的两格（4 邻位置冲突）
//   从渲染层上移到本模块：生成端（撒播笼间等值）与渲染端（选端点）共用同一实现，
//   保证"撒播时避开的位置"与"渲染时选中的位置"完全一致
export function cellIneqUsesPair(cellIneqList: CellInequality[], a: number, b: number): boolean {
  for (const ii of cellIneqList) {
    if ((ii.a === a && ii.b === b) || (ii.a === b && ii.b === a)) return true;
  }
  return false;
}

// 为笼间约束（大小/等值共用）选取一对端点格：A 笼一格 + B 笼一格
//   要求：两格棋盘距离 ≤ 1（同行/列相邻或对角相邻），避免连线横跨多格遮挡候选数
//   优先"距离最近且不与格间大小约束的两格重合"；全部冲突或无相邻格对时返回 null
//   （上层撒播收到 null 后跳过该笼对，由 pipeline 外层换新题）
//   确定性函数：同输入必同输出——这是撒播端与渲染端位置一致的前提
export function pickCageEndpoints(
  cageA: Cage,
  cageB: Cage,
  cellIneqList: CellInequality[],
): { a: number; b: number; conflict: boolean } | null {
  type Cand = { a: number; b: number; dist: number; conflict: boolean };
  const cands: Cand[] = [];
  for (const a of cageA.cells) {
    for (const b of cageB.cells) {
      const ar = Math.floor(a / 9), ac = a % 9;
      const br = Math.floor(b / 9), bc = b % 9;
      // 棋盘距离 = max(|dr|, |dc|)：≤ 1 表示同行/列相邻或对角相邻
      //   连线只穿两个端点格之间的共享边或角点，不会遮挡其他格的候选数
      const boardDist = Math.max(Math.abs(ar - br), Math.abs(ac - bc));
      if (boardDist > 1) continue; // 横跨多格的端点直接排除
      const manhattan = Math.abs(ar - br) + Math.abs(ac - bc);
      // 4 邻且共享 cellIneq 边 → 冲突（三角/等号会压到蓝色箭头）
      const conflict = manhattan === 1 && cellIneqUsesPair(cellIneqList, a, b);
      cands.push({ a, b, dist: manhattan, conflict });
    }
  }
  if (cands.length === 0) return null; // 两笼无相邻格对，不撒约束
  // 排序：先冲突升序（false 在前），再距离升序
  cands.sort((x, y) => {
    if (x.conflict !== y.conflict) return x.conflict ? 1 : -1;
    return x.dist - y.dist;
  });
  const best = cands[0];
  return { a: best.a, b: best.b, conflict: best.conflict };
}

// 端点对的格坐标中点（行列可为 .5 边界值）：笼间符号位置的统一参考
export function cageEndpointMidpoint(
  ep: { a: number; b: number },
): { r: number; c: number } {
  return {
    r: (Math.floor(ep.a / 9) + Math.floor(ep.b / 9)) / 2,
    c: ((ep.a % 9) + (ep.b % 9)) / 2,
  };
}

// 在完整解上铺设笼子：所有 81 格必须属于某笼，每笼 2~5 格连通
//   策略：随机选未分配种子格 → 贪心向相邻未分配格扩展 → 笼大小随机 2~5
//   关键约束：笼内数字必须互不重复（Killer 标准规则，且求解器 CageConstraint 依赖此性质）
//     否则全给定时笼内重复值会让传播器互相删空候选 → 误判无解
//   处理残余 1 格：合并到任一相邻笼（需检查数字不重复；若无可合并则保留单格笼）
export function layCages(sol: number[], rng: () => number = Math.random): Cage[] {
  const assigned = new Set<number>();
  const cages: Cage[] = [];
  let nextId = 0;

  while (assigned.size < 81) {
    // 找未分配种子
    const unassigned: number[] = [];
    for (let i = 0; i < 81; i++) if (!assigned.has(i)) unassigned.push(i);
    if (unassigned.length === 0) break;
    const seed = unassigned[Math.floor(rng() * unassigned.length)];

    // 随机笼大小 2~5（不大于剩余未分配格数）
    const maxSize = Math.min(5, unassigned.length);
    const minSize = Math.min(2, maxSize);
    const targetSize = minSize + Math.floor(rng() * (maxSize - minSize + 1));

    const cageCells: number[] = [seed];
    const usedDigits = new Set<number>([sol[seed]]); // 跟踪笼内已用数字
    assigned.add(seed);
    while (cageCells.length < targetSize) {
      // 收集与笼相邻的未分配格（且其 sol 值不与笼内已用数字重复）
      const candidates = collectAdjacentUnassigned(cageCells, assigned, sol, usedDigits);
      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(rng() * candidates.length)];
      cageCells.push(pick);
      usedDigits.add(sol[pick]);
      assigned.add(pick);
    }

    const sum = cageCells.reduce((acc, idx) => acc + sol[idx], 0);
    cages.push({ id: nextId++, cells: cageCells, sum });
  }

  mergeSingletons(cages, sol);
  return cages;
}

// 收集与笼相邻的未分配格；usedDigits 非空时还需过滤掉会引入重复数字的格子
function collectAdjacentUnassigned(
  cells: number[],
  assigned: Set<number>,
  sol: number[],
  usedDigits: Set<number>,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const cell of cells) {
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    const neighbors: number[] = [
      r > 0 ? cell - 9 : -1,
      r < 8 ? cell + 9 : -1,
      c > 0 ? cell - 1 : -1,
      c < 8 ? cell + 1 : -1,
    ];
    for (const n of neighbors) {
      if (n >= 0 && !assigned.has(n) && !seen.has(n) && !usedDigits.has(sol[n])) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

// 合并单格笼到任一相邻笼（保持 ≤5 格限制 + 笼内不重复）
function mergeSingletons(cages: Cage[], sol: number[]): void {
  let i = 0;
  while (i < cages.length) {
    const cage = cages[i];
    if (cage.cells.length !== 1) {
      i++;
      continue;
    }
    const cell = cage.cells[0];
    const digit = sol[cell];
    const r = Math.floor(cell / 9);
    const c = cell % 9;
    const neighbors: number[] = [
      r > 0 ? cell - 9 : -1,
      r < 8 ? cell + 9 : -1,
      c > 0 ? cell - 1 : -1,
      c < 8 ? cell + 1 : -1,
    ];
    let merged = false;
    for (const n of neighbors) {
      if (n < 0) continue;
      for (const other of cages) {
        if (other === cage) continue;
        // 同时满足：≤5 格 + 笼内不重复（digit 不在该笼已有数字中）
        const otherDigits = new Set(other.cells.map((idx) => sol[idx]));
        if (other.cells.length < 5 && other.cells.includes(n) && !otherDigits.has(digit)) {
          other.cells.push(cell);
          if (other.sum !== null) other.sum += sol[cell];
          cages.splice(i, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
    if (!merged) i++; // 无可合并对象，保留为单格笼
  }
  // 重新编号 id
  cages.forEach((c, idx) => (c.id = idx));
}

// 工具：克隆 cages 数组
export function cloneCages(cages: Cage[]): Cage[] {
  return cages.map((c) => ({ id: c.id, cells: c.cells.slice(), sum: c.sum }));
}

// 按比例随机选若干笼设为隐藏（sum=null）
//   minHidden 保证至少 N 个隐藏笼，确保 cage-ineq 与 rule-45 有作用对象
//   隐藏策略（需求4 配套）：优先把"和值相近的相邻笼对"整体隐藏——
//     笼间大小约束要求两笼都隐藏、相邻、且和值差 ≤ 弹性上限（elasticLimit），
//     若随机隐藏，满足三条件的对几乎不存在（实测 cageIneq≈0）；
//     先按真实和值筛出可行对，成对隐藏，剩余名额再随机补齐
export function markHiddenCages(
  cages: Cage[],
  rate: number,
  minHidden: number,
  rng: () => number,
  sol?: number[],
): void {
  if (rate === 0 && minHidden === 0) return;
  const numToHide = Math.max(minHidden, Math.floor(cages.length * rate));
  if (numToHide <= 0) return;

  const hidden = new Set<number>();
  // 有 sol 时走"可行对优先"策略：为 cage-ineq / cage-eq 制造作用对象
  if (sol) {
    const trueSum = (c: Cage) => c.cells.reduce((s, idx) => s + sol[idx], 0);
    const viable: Array<[Cage, Cage]> = [];
    for (const [a, b] of findAdjacentCagePairs(cages)) {
      const sa = trueSum(a);
      const sb = trueSum(b);
      const diff = Math.abs(sa - sb);
      // 差值在弹性上限内（含相等）的对才值得隐藏：相等留给 cage-eq，相近留给 cage-ineq
      if (diff <= elasticLimit(Math.min(sa, sb))) viable.push([a, b]);
    }
    shufflePairs(viable, rng);
    for (const [a, b] of viable) {
      if (hidden.size >= numToHide) break;
      if (hidden.has(a.id) || hidden.has(b.id)) continue;
      // 跳过会超额的对（成对隐藏保证对的完整性）
      if (hidden.size + 2 > numToHide) break;
      hidden.add(a.id);
      hidden.add(b.id);
    }
  }
  // 名额未满：随机补齐剩余隐藏笼
  if (hidden.size < numToHide) {
    const rest = cages.filter((c) => !hidden.has(c.id));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    for (const c of rest) {
      if (hidden.size >= numToHide) break;
      hidden.add(c.id);
    }
  }
  for (const c of cages) {
    if (hidden.has(c.id)) c.sum = null;
  }
}

function shufflePairs<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// 工具：找所有相邻笼对（用于约束撒播与可视化）
export function findAdjacentCagePairs(cages: Cage[]): Array<[Cage, Cage]> {
  const out: Array<[Cage, Cage]> = [];
  for (let i = 0; i < cages.length; i++) {
    for (let j = i + 1; j < cages.length; j++) {
      if (cagesAdjacent(cages[i], cages[j])) {
        out.push([cages[i], cages[j]]);
      }
    }
  }
  return out;
}

function cagesAdjacent(a: Cage, b: Cage): boolean {
  const bset = new Set<number>(b.cells);
  for (const idx of a.cells) {
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const cand = [
      r > 0 ? idx - 9 : -1,
      r < 8 ? idx + 9 : -1,
      c > 0 ? idx - 1 : -1,
      c < 8 ? idx + 1 : -1,
    ];
    if (cand.some((x) => x >= 0 && bset.has(x))) return true;
  }
  return false;
}
