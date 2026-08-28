import type { Puzzle } from '@/types/puzzle';

// 一道手工构造的全给定 Killer 数独样本（用于回归测试）
//   解：经典 9×9 数独完整解
//   笼子：3 个，按完整解算出和值
//   大小约束：少量格间 + 笼间，用于验证约束传播
//   所有 81 格作为给定——trivially 唯一解，可验证求解器基础正确性
const solution = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
];

// 笼子：选 3 个不重叠的连通块
//   笼 0: 行0 列0,1,2 = 5+3+4=12
//   笼 1: 行3 列3,4,5 = 7+6+1=14
//   笼 2: 行8 列6,7,8 = 1+7+9=17
//   其余每格独立成笼（和=格值），仅作为占位以保持数据完整
function buildCages() {
  const cages: { id: number; cells: number[]; sum: number | null }[] = [];
  const assigned = new Set<number>();
  const groups = [
    { cells: [0, 1, 2] },
    { cells: [30, 31, 32] },
    { cells: [78, 79, 80] },
  ];
  let id = 0;
  for (const g of groups) {
    const sum = g.cells.reduce((s, idx) => s + solution[idx], 0);
    cages.push({ id: id++, cells: g.cells, sum });
    g.cells.forEach((idx) => assigned.add(idx));
  }
  // 其余格作为单格笼
  for (let i = 0; i < 81; i++) {
    if (!assigned.has(i)) {
      cages.push({ id: id++, cells: [i], sum: solution[i] });
    }
  }
  return cages;
}

// 构造全给定谜题
export function makeSamplePuzzle(): Puzzle {
  const cages = buildCages();
  const givens = new Map<number, number>();
  for (let i = 0; i < 81; i++) givens.set(i, solution[i]);
  return {
    id: 'sample-full-givens',
    difficulty: 'easy',
    solution: solution.slice(),
    cages,
    cellIneq: [], // 样本不带大小约束
    cageIneq: [],
    cellEq: [], // 样本不带等值约束
    cageEq: [],
    givens,
    rating: 0,
    techniqueMax: '',
    steps: 0,
  };
}

// 构造"半给定"谜题：仅保留部分给定，用于测试求解器
//   注意：本样本不一定唯一解，仅用于求解器基础测试
export function makePartialPuzzle(givenCount: number): Puzzle {
  const base = makeSamplePuzzle();
  const indices = Array.from({ length: 81 }, (_, i) => i);
  // 随机选 givenCount 个保留，其余删除
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const givens = new Map<number, number>();
  for (let i = 0; i < givenCount; i++) {
    const idx = indices[i];
    givens.set(idx, base.solution[idx]);
  }
  return { ...base, id: `sample-partial-${givenCount}`, givens };
}

export { solution as SAMPLE_SOLUTION };
