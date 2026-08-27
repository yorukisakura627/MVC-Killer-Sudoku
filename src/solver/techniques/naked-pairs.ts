import { ALL_UNITS } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Naked Pairs：某 unit 内有两格候选集都恰好是 {a, b}，则 a, b 不可能在该 unit 其他格出现
//   - 删除 unit 其他格的 a, b 候选
//   - 难度等级 3，普通及更高级别使用
export class NakedPairs implements Technique {
  readonly name = 'naked-pairs';
  readonly level = 3;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    void ctx;
    for (const unit of ALL_UNITS) {
      // 候选集恰好 2 值的格子
      const cand2 = unit.cells.filter((idx) => grid.cands[idx].size === 2);
      for (let i = 0; i < cand2.length; i++) {
        for (let j = i + 1; j < cand2.length; j++) {
          if (grid.cands[cand2[i]].equals(grid.cands[cand2[j]])) {
            const values = grid.cands[cand2[i]].toArray();
            // 从 unit 其他格删除这俩值
            let changed = false;
            for (const idx of unit.cells) {
              if (idx === cand2[i] || idx === cand2[j]) continue;
              for (const v of values) {
                if (grid.cands[idx].has(v)) {
                  grid.cands[idx].remove(v);
                  changed = true;
                }
              }
            }
            if (changed) {
              return {
                applied: true,
                steps: [
                  {
                    technique: this.name,
                    target: cand2[i],
                    value: 0,
                    reason: `${unit.kind === 'row' ? '行' : unit.kind === 'col' ? '列' : '宫'} ${unit.index + 1} 内形成裸对 [${values.join(',')}]，删除其他格候选`,
                  },
                ],
              };
            }
          }
        }
      }
    }
    return { applied: false, steps: [] };
  }
}
