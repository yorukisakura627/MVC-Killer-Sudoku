import type { Cage } from '@/types/cage';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Cage Combos：对某笼，列举所有"合法数字组合"，若仅一种 → 收缩候选
//   - 合法组合：长度 = 笼格数，数字不重复，和 = 笼和（隐藏笼 sum=null 时跳过本技巧）
//   - 候选限制：组合中每个数字必须能放在某格（即至少有 1 格候选含此数）
//   - 若仅一种组合 → 把组合外的候选从笼内所有格删除；若某格变单值 → 记录该格
//   一次只处理一个笼，避免冲突
//   难度等级 2，简单及更高级别使用
export class CageCombos implements Technique {
  readonly name = 'cage-combos';
  readonly level = 2;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    for (const cage of ctx.puzzle.cages) {
      if (cage.sum === null) continue; // 隐藏笼跳过（由 inequality-cage / rule-45 处理）
      // 跳过无自由格或已全部单值的笼
      const free = cage.cells.filter((idx) => !ctx.resolved.has(idx));
      if (free.length === 0) continue;

      const combos = enumerateCombos(cage, grid);
      if (combos.length !== 1) continue;

      const only = combos[0];
      const allowedMask = only.reduce((acc, v) => acc | (1 << (v - 1)), 0);
      let target = -1;
      let targetVal = 0;
      let changedAny = false;
      for (const idx of free) {
        const before = grid.cands[idx].bits;
        const after = before & allowedMask;
        if (after !== before) {
          grid.cands[idx].bits = after;
          changedAny = true;
          if (grid.cands[idx].size === 1) {
            const v = grid.cands[idx].singleValue()!;
            if (target < 0) {
              target = idx;
              targetVal = v;
            }
          }
        }
      }
      if (!changedAny) continue;
      const step = {
        technique: this.name,
        target: target >= 0 ? target : free[0],
        value: targetVal,
        reason: `笼 ${cage.id + 1}（和=${cage.sum}, ${cage.cells.length} 格）仅可能组合 [${only.join(',')}]`,
      };
      return { applied: true, steps: [step] };
    }
    return { applied: false, steps: [] };
  }
}

// 枚举笼的所有合法组合：和=笼和、长度=笼格数、不重复、每数字至少能在笼内某格出现
function enumerateCombos(cage: Cage, grid: CandidateGrid): number[][] {
  const cells = cage.cells;
  const sum = cage.sum!;
  const k = cells.length;
  const candArr = cells.map((idx) => grid.cands[idx].toArray());
  // 笼内可用的所有数字（去重升序）
  const allDigits = Array.from(new Set(candArr.flat())).sort((a, b) => a - b);
  const results: number[][] = [];

  function dfs(start: number, chosen: number[], remaining: number) {
    if (chosen.length === k) {
      if (remaining === 0) {
        // 校验 chosen 能覆盖笼内每格：每格至少 1 个候选在 chosen 中
        if (cells.every((_, i) => candArr[i].some((d) => chosen.includes(d)))) {
          results.push(chosen.slice());
        }
      }
      return;
    }
    for (let i = start; i < allDigits.length; i++) {
      const d = allDigits[i];
      if (d > remaining) break; // 剪枝：剩余数字无法凑和
      dfs(i + 1, [...chosen, d], remaining - d);
    }
  }
  dfs(0, [], sum);
  return results;
}
