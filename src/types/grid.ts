// 网格坐标与索引辅助：数独用扁平索引 0..80 表示 81 格，便于位运算和数组访问
// 行列宫三种"单位"（unit）是数独约束传播的基本结构

export type CellIdx = number; // 0..80 的扁平索引
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const GRID_SIZE = 9;
export const CELL_COUNT = 81;

// 索引 ↔ 坐标互转
export function idxFrom(r: number, c: number): CellIdx {
  return r * GRID_SIZE + c;
}
export function rowOf(idx: CellIdx): number {
  return Math.floor(idx / GRID_SIZE);
}
export function colOf(idx: CellIdx): number {
  return idx % GRID_SIZE;
}
// 宫编号 0..8，按从左上到右下的顺序
export function boxOf(idx: CellIdx): number {
  const r = rowOf(idx);
  const c = colOf(idx);
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

// 同一单位内的格子集合
export type Unit = { kind: 'row' | 'col' | 'box'; index: number; cells: CellIdx[] };

// 预计算 9 行 + 9 列 + 9 宫，共 27 个单位，避免每次实时构造
function buildUnits(): Unit[] {
  const rows: CellIdx[][] = Array.from({ length: 9 }, () => []);
  const cols: CellIdx[][] = Array.from({ length: 9 }, () => []);
  const boxes: CellIdx[][] = Array.from({ length: 9 }, () => []);
  for (let idx = 0; idx < CELL_COUNT; idx++) {
    rows[rowOf(idx)].push(idx);
    cols[colOf(idx)].push(idx);
    boxes[boxOf(idx)].push(idx);
  }
  const result: Unit[] = [];
  for (let i = 0; i < 9; i++) {
    result.push({ kind: 'row', index: i, cells: rows[i] });
    result.push({ kind: 'col', index: i, cells: cols[i] });
    result.push({ kind: 'box', index: i, cells: boxes[i] });
  }
  return result;
}

export const ALL_UNITS: readonly Unit[] = buildUnits();

// 给定格子的三个相关单位（同行、同列、同宫）
export function unitsOf(idx: CellIdx): [Unit, Unit, Unit] {
  return [
    ALL_UNITS[rowOf(idx) * 3], // row i → 索引 3i
    ALL_UNITS[1 + colOf(idx) * 3], // col i → 索引 3i+1
    ALL_UNITS[2 + boxOf(idx) * 3], // box i → 索引 3i+2
  ];
}

// 相邻格子（上下左右），用于生成与传播"格间大小约束"
export function neighborsOf(idx: CellIdx): CellIdx[] {
  const r = rowOf(idx);
  const c = colOf(idx);
  const out: CellIdx[] = [];
  if (r > 0) out.push(idxFrom(r - 1, c));
  if (r < 8) out.push(idxFrom(r + 1, c));
  if (c > 0) out.push(idxFrom(r, c - 1));
  if (c < 8) out.push(idxFrom(r, c + 1));
  return out;
}

// 共享边的两格才有"格间大小约束"。返回 [a,b] 边的方向（'h' 横向同列相邻 / 'v' 纵向同行相邻）
export type EdgeDir = 'h' | 'v';
export function edgeBetween(a: CellIdx, b: CellIdx): EdgeDir | null {
  const ra = rowOf(a), ca = colOf(a);
  const rb = rowOf(b), cb = colOf(b);
  if (ra === rb && Math.abs(ca - cb) === 1) return 'v'; // 同行 → 垂直边
  if (ca === cb && Math.abs(ra - rb) === 1) return 'h'; // 同列 → 水平边
  return null;
}

export const ALL_CELLS: readonly CellIdx[] = Array.from({ length: CELL_COUNT }, (_, i) => i);
