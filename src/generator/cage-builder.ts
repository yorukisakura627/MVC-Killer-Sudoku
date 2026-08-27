import type { Cage } from '@/types/cage';
import type { CellIdx } from '@/types/grid';

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
export function markHiddenCages(
  cages: Cage[],
  rate: number,
  minHidden: number,
  rng: () => number,
): void {
  if (rate === 0 && minHidden === 0) return;
  const numToHide = Math.max(minHidden, Math.floor(cages.length * rate));
  if (numToHide <= 0) return;
  const shuffled = cages.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < numToHide && i < shuffled.length; i++) {
    shuffled[i].sum = null;
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

// 显式标记未使用导入（避免 TS noUnusedLocals 报错）
void (null as unknown as CellIdx);
