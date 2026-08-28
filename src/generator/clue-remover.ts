import type { Puzzle } from '@/types/puzzle';
import { hasUniqueSolution } from '@/solver/backtrack';

// 分阶段移除给定数（含用户规则 1/4 约束）：
//   规则 1：有和值笼（sum !== null）不可以全部给定格值——挖空前为每个有和值笼
//           预选一个"牺牲格"必挖；唯一性失败则换笼内另一格重试，全失败换新题
//   规则 4：每行/列/宫至少一个空格——随机挖空完成后扫描 27 个单元，
//           全给定的单元强制挖掉一格；修复导致给定数低于下限时换新题
//   阶段 1：牺牲格必挖（逐格验证唯一性，失败换同笼格，笼内全失败返回 null）
//   阶段 2：随机顺序逐格尝试移除到 targetGivens（每步验证唯一解，不唯一回退）
//   阶段 3：规则 4 修复 + 给定数下限校验
//   返回 null 表示本题无法满足规则，调用方应换新题重试
export function removeCluesToTarget(
  p: Puzzle,
  targetGivens: number,
  rng: () => number = Math.random,
  minAllowedGivens = 0,
): Puzzle | null {
  const cloned = clonePuzzle(p);

  // === 阶段 1：规则 1 牺牲格 ===
  //   有和值笼随机选一格作为牺牲格；挖空顺序即牺牲格顺序
  //   （此时给定数接近 81，唯一性极易保持；越晚挖越难，故优先处理）
  //   sacrificeFallbacks 记录每笼的备选顺序：牺牲格挖不掉时依次换下一格
  const sacrificeFallbacks = new Map<number, number[]>();
  for (const cage of cloned.cages) {
    if (cage.sum === null) continue;
    const shuffled = cage.cells.slice();
    shuffleInPlace(shuffled, rng);
    sacrificeFallbacks.set(cage.id, shuffled);
  }
  for (const fallbacks of sacrificeFallbacks.values()) {
    let placed = false;
    for (const idx of fallbacks) {
      const val = cloned.givens.get(idx)!;
      cloned.givens.delete(idx);
      if (hasUniqueSolution(cloned)) { placed = true; break; }
      cloned.givens.set(idx, val); // 回退，换笼内下一格
    }
    if (!placed) return null; // 该笼无法保留空格，整题重试
  }

  // === 阶段 2：随机挖空到目标 ===
  const order = Array.from({ length: 81 }, (_, i) => i);
  shuffleInPlace(order, rng);
  for (const idx of order) {
    if (cloned.givens.size <= targetGivens) break;
    if (!cloned.givens.has(idx)) continue;
    const val = cloned.givens.get(idx)!;
    cloned.givens.delete(idx);
    if (!hasUniqueSolution(cloned)) {
      cloned.givens.set(idx, val); // 回退
    }
  }

  // === 阶段 3：规则 4——每行/列/宫至少一个空格 ===
  //   扫描 27 个单元，全给定的单元随机选一格挖掉（验证唯一性）
  const units: number[][] = [];
  for (let r = 0; r < 9; r++) units.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) units.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box: number[] = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) box.push((br * 3 + r) * 9 + bc * 3 + c);
      }
      units.push(box);
    }
  }
  for (const unit of units) {
    if (!unit.every((i) => cloned.givens.has(i))) continue;
    const shuffled = unit.slice();
    shuffleInPlace(shuffled, rng);
    let fixed = false;
    for (const idx of shuffled) {
      const val = cloned.givens.get(idx)!;
      cloned.givens.delete(idx);
      if (hasUniqueSolution(cloned)) { fixed = true; break; }
      cloned.givens.set(idx, val);
    }
    if (!fixed) return null; // 该单元无法留出空格，整题重试
  }

  // 修复挖空可能使给定数低于范围下限：低于则本题放弃重试
  if (cloned.givens.size < minAllowedGivens) return null;

  return cloned;
}

// 工具：深克隆谜题（避免污染原对象）
export function clonePuzzle(p: Puzzle): Puzzle {
  return {
    id: p.id,
    difficulty: p.difficulty,
    solution: p.solution.slice(),
    cages: p.cages.map((c) => ({ id: c.id, cells: c.cells.slice(), sum: c.sum })),
    cellIneq: p.cellIneq.map((c) => ({ ...c })),
    cageIneq: p.cageIneq.map((c) => ({ ...c })),
    // 等值约束随克隆保留：移除给定数的过程中约束集不变
    cellEq: p.cellEq.map((c) => ({ ...c })),
    cageEq: p.cageEq.map((c) => ({ ...c })),
    givens: new Map(p.givens),
    rating: p.rating,
    techniqueMax: p.techniqueMax,
    steps: p.steps,
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
