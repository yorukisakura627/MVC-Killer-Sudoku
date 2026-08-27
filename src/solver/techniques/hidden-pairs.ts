import { ALL_UNITS } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Hidden Pairs：某 unit 内两数字 a, b 仅能在两格中出现（且仅这两格），则该两格候选收缩为 {a, b}
//   - 删除这两格中除 a, b 外的候选
//   - 难度等级 3，普通及更高级别使用
export class HiddenPairs implements Technique {
  readonly name = 'hidden-pairs';
  readonly level = 3;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    void ctx;
    for (const unit of ALL_UNITS) {
      for (let a = 1; a <= 9; a++) {
        for (let b = a + 1; b <= 9; b++) {
          const aCells = unit.cells.filter((idx) => grid.cands[idx].has(a));
          const bCells = unit.cells.filter((idx) => grid.cands[idx].has(b));
          if (aCells.length !== 2 || bCells.length !== 2) continue;
          // 两数字的可放位置集合应相同（仅这两格）
          const setA = new Set(aCells);
          const setB = new Set(bCells);
          if (setA.size !== 2 || setB.size !== 2) continue;
          const union = new Set([...setA, ...setB]);
          if (union.size !== 2) continue;
          // 收缩这两格候选为 {a, b}
          const keepMask = (1 << (a - 1)) | (1 << (b - 1));
          let changed = false;
          let target = -1;
          for (const idx of union) {
            const before = grid.cands[idx].bits;
            const after = before & keepMask;
            if (after !== before) {
              grid.cands[idx].bits = after;
              changed = true;
              if (target < 0) target = idx;
            }
          }
          if (changed) {
            return {
              applied: true,
              steps: [
                {
                  technique: this.name,
                  target,
                  value: 0,
                  reason: `${unit.kind === 'row' ? '行' : unit.kind === 'col' ? '列' : '宫'} ${unit.index + 1} 内数字 ${a},${b} 仅能放在两格，收缩候选`,
                },
              ],
            };
          }
        }
      }
    }
    return { applied: false, steps: [] };
  }
}
