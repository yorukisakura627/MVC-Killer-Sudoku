import { ALL_UNITS, boxOf, rowOf, colOf } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Pointing Pairs：某宫内某数字 v 的所有候选位置都在同一行（或列），则该行（列）宫外格删除 v
//   - 难度等级 3，普通及更高级别使用
//   - 也覆盖"指向三元组"（3 个候选位置同向）
export class PointingPairs implements Technique {
  readonly name = 'pointing-pairs';
  readonly level = 3;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    void ctx;
    // 9 个宫
    const boxes = ALL_UNITS.filter((u) => u.kind === 'box');
    for (const box of boxes) {
      for (let v = 1; v <= 9; v++) {
        const positions = box.cells.filter((idx) => grid.cands[idx].has(v));
        if (positions.length === 0) continue;
        const rows = new Set(positions.map((p) => rowOf(p)));
        const cols = new Set(positions.map((p) => colOf(p)));
        // 同行：从该行宫外格删除 v
        if (rows.size === 1) {
          const r = [...rows][0];
          let changed = false;
          let target = -1;
          for (let c = 0; c < 9; c++) {
            const idx = r * 9 + c;
            if (boxOf(idx) === box.index) continue;
            if (grid.cands[idx].has(v)) {
              grid.cands[idx].remove(v);
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
                  reason: `宫 ${box.index + 1} 中数字 ${v} 仅出现在第 ${r + 1} 行，删除该行宫外候选`,
                },
              ],
            };
          }
        }
        // 同列：从该列宫外格删除 v
        if (cols.size === 1) {
          const c = [...cols][0];
          let changed = false;
          let target = -1;
          for (let r = 0; r < 9; r++) {
            const idx = r * 9 + c;
            if (boxOf(idx) === box.index) continue;
            if (grid.cands[idx].has(v)) {
              grid.cands[idx].remove(v);
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
                  reason: `宫 ${box.index + 1} 中数字 ${v} 仅出现在第 ${c + 1} 列，删除该列宫外候选`,
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
