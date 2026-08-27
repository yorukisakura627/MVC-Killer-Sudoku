import { rowOf, colOf, boxOf, idxFrom } from '@/types/grid';

// 生成一个完整有效的数独解：81 格全填满，行/列/宫 1-9 不重复
//   策略：随机化回溯，每格随机选可用值；遇到死路回退
//   优化：先填三个对角宫（互不共享行列），再填其余，可大幅减少回溯
export function randomFullGrid(rng: () => number = Math.random): number[] {
  const grid = new Array<number>(81).fill(0);
  // 先填三个对角宫：索引 0,40,80 所在宫
  const diagBoxes = [0, 4, 8];
  for (const b of diagBoxes) {
    fillBox(grid, b, rng);
  }
  // 回溯填其余格
  solveBacktrack(grid, 0, rng);
  return grid;
}

function fillBox(grid: number[], box: number, rng: () => number): void {
  const baseRow = Math.floor(box / 3) * 3;
  const baseCol = (box % 3) * 3;
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  let i = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      grid[idxFrom(baseRow + r, baseCol + c)] = digits[i++];
    }
  }
}

// 回溯填空格（从指定位置开始）
function solveBacktrack(grid: number[], start: number, rng: () => number): boolean {
  let idx = start;
  while (idx < 81 && grid[idx] !== 0) idx++;
  if (idx === 81) return true;
  const cands = availableDigits(grid, idx);
  const shuffledCands = shuffled(cands, rng);
  for (const v of shuffledCands) {
    grid[idx] = v;
    if (solveBacktrack(grid, idx + 1, rng)) return true;
    grid[idx] = 0;
  }
  return false;
}

function availableDigits(grid: number[], idx: number): number[] {
  const r = rowOf(idx);
  const c = colOf(idx);
  const b = boxOf(idx);
  const used = new Set<number>();
  for (let i = 0; i < 9; i++) {
    used.add(grid[idxFrom(r, i)]); // 同行
    used.add(grid[idxFrom(i, c)]); // 同列
  }
  const br = Math.floor(b / 3) * 3;
  const bc = (b % 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      used.add(grid[idxFrom(br + i, bc + j)]);
    }
  }
  used.delete(0);
  const out: number[] = [];
  for (let v = 1; v <= 9; v++) if (!used.has(v)) out.push(v);
  return out;
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 简易可重现随机数生成器（mulberry32）
//   用于离线生成脚本保证可重现与可复现测试
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
