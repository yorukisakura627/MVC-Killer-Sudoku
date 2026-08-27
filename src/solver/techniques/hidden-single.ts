import { ALL_UNITS } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Hidden Single：某 unit（行/列/宫）内某数字仅能放在唯一格子 → 该格定值
//   主动修改 grid（setValue），让后续传播自动处理同 unit 的删候选
//   一次只找 1 个，避免连续修改导致状态不一致
//   难度等级 1，所有难度档都使用
export class HiddenSingle implements Technique {
  readonly name = 'hidden-single';
  readonly level = 1;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    for (const unit of ALL_UNITS) {
      // 对每个数字 1..9，统计能在 unit 内放的位置
      for (let v = 1; v <= 9; v++) {
        let placedAt = -1;
        let count = 0;
        for (const idx of unit.cells) {
          if (grid.cands[idx].has(v)) {
            placedAt = idx;
            count++;
            if (count > 1) break;
          }
        }
        if (count === 1 && !ctx.resolved.has(placedAt)) {
          grid.setValue(placedAt, v);
          return {
            applied: true,
            steps: [
              {
                technique: this.name,
                target: placedAt,
                value: v,
                reason: `${unit.kind === 'row' ? '行' : unit.kind === 'col' ? '列' : '宫'} ${unit.index + 1} 中数字 ${v} 只能放在此格`,
              },
            ],
          };
        }
      }
    }
    return { applied: false, steps: [] };
  }
}
