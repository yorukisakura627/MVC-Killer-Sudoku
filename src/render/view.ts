import type { Cage } from '@/types/cage';
import type { Puzzle } from '@/types/puzzle';

// 视图模型：从谜题+用户输入构造，供渲染层与输入层共享
export interface CellState {
  value: number; // 0 = 空
  isGiven: boolean;
  userCands: Set<number>; // 用户手动标记的候选数
  conflict: boolean; // 与解/约束冲突
}

export interface View {
  puzzle: Puzzle;
  cells: CellState[]; // 长度 81
  selected: number; // 主选中格 idx，-1 无
  selectedSet: Set<number>; // 多选集合（需求1），单选时仅含 selected
  candidateMode: boolean; // 是否候选标记模式
  hintTarget: number; // 提示高亮格 idx，-1 无
  // 渲染参数
  cellSize: number;
  origin: { x: number; y: number };
}

export function createView(puzzle: Puzzle, opts?: Partial<View>): View {
  const cells: CellState[] = Array.from({ length: 81 }, (_, i) => ({
    value: puzzle.givens.get(i) ?? 0,
    isGiven: puzzle.givens.has(i),
    userCands: new Set<number>(),
    conflict: false,
  }));
  return {
    puzzle,
    cells,
    selected: -1,
    selectedSet: new Set<number>(),
    candidateMode: false,
    hintTarget: -1,
    cellSize: 56,
    origin: { x: 16, y: 16 },
    ...opts,
  };
}

// 选中格的同行/同列/同宫 peer 集合（高亮用）
export function getPeers(idx: number): Set<number> {
  if (idx < 0) return new Set();
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  const peers = new Set<number>();
  for (let i = 0; i < 9; i++) {
    peers.add(r * 9 + i);
    peers.add(i * 9 + c);
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      peers.add((br + i) * 9 + (bc + j));
    }
  }
  peers.delete(idx);
  return peers;
}

// 格子所属的笼
export function cageOfCell(puzzle: Puzzle, idx: number): Cage | undefined {
  for (const c of puzzle.cages) {
    if (c.cells.includes(idx)) return c;
  }
  return undefined;
}

// 网格总像素尺寸
export function gridSizePx(view: View): number {
  return view.cellSize * 9;
}

// 格子 idx 的像素矩形（左上角 + 尺寸）
export function cellRect(view: View, idx: number): { x: number; y: number; w: number; h: number } {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  return {
    x: view.origin.x + c * view.cellSize,
    y: view.origin.y + r * view.cellSize,
    w: view.cellSize,
    h: view.cellSize,
  };
}

// 像素坐标 → 格子 idx（-1 表示点击在网格外）
export function pickCell(view: View, px: number, py: number): number {
  const total = gridSizePx(view);
  if (px < view.origin.x || px >= view.origin.x + total) return -1;
  if (py < view.origin.y || py >= view.origin.y + total) return -1;
  const c = Math.floor((px - view.origin.x) / view.cellSize);
  const r = Math.floor((py - view.origin.y) / view.cellSize);
  return r * 9 + c;
}
