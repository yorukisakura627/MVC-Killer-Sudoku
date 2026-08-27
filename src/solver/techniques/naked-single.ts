import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Naked Single：某格候选集只剩 1 个值，直接定值
//   约束传播会自动让候选变单值，这里只负责"扫描并记录步骤"，不修改 grid
//   修改由后续传播完成（UnitConstraint 会用单值删除同行列宫的候选）
//   一次扫描所有未记录的单值格，批量记录步骤，提升求解效率
//   难度等级 1，所有难度档都使用
export class NakedSingle implements Technique {
  readonly name = 'naked-single';
  readonly level = 1;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    const steps = [];
    for (let i = 0; i < 81; i++) {
      if (ctx.resolved.has(i)) continue;
      const c = grid.cands[i];
      if (c.size === 1 && !c.isEmpty()) {
        const v = c.singleValue()!;
        ctx.resolved.add(i);
        steps.push({
          technique: this.name,
          target: i,
          value: v,
          reason: `第 ${Math.floor(i / 9) + 1} 行第 ${(i % 9) + 1} 列只剩唯一候选 ${v}`,
        });
      }
    }
    return { applied: steps.length > 0, steps };
  }
}
