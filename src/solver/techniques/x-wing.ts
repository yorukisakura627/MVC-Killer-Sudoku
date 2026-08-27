import { rowOf, colOf } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// X-Wing：某数字 v 在两行（列）的可放位置恰好构成矩型 (r1,c1)(r1,c2)(r2,c1)(r2,c2)
//   则该两列（行）的其他格删除 v
//   - 难度等级 5，困难级使用
//   - 行版本与列版本对称，均实现
export class XWing implements Technique {
  readonly name = 'x-wing';
  readonly level = 5;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    void ctx;
    for (let v = 1; v <= 9; v++) {
      // 行版本：找两行，每行 v 恰好 2 个候选位置且列号相同
      const rowCols: { r: number; cols: number[] }[] = [];
      for (let r = 0; r < 9; r++) {
        const cols: number[] = [];
        for (let c = 0; c < 9; c++) {
          if (grid.cands[r * 9 + c].has(v)) cols.push(c);
        }
        if (cols.length === 2) rowCols.push({ r, cols });
      }
      for (let i = 0; i < rowCols.length; i++) {
        for (let j = i + 1; j < rowCols.length; j++) {
          if (
            rowCols[i].cols[0] === rowCols[j].cols[0] &&
            rowCols[i].cols[1] === rowCols[j].cols[1]
          ) {
            const c1 = rowCols[i].cols[0];
            const c2 = rowCols[i].cols[1];
            const r1 = rowCols[i].r;
            const r2 = rowCols[j].r;
            let changed = false;
            let target = -1;
            for (let r = 0; r < 9; r++) {
              if (r === r1 || r === r2) continue;
              for (const c of [c1, c2]) {
                const idx = r * 9 + c;
                if (grid.cands[idx].has(v)) {
                  grid.cands[idx].remove(v);
                  changed = true;
                  if (target < 0) target = idx;
                }
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
                    reason: `行 ${r1 + 1},${r2 + 1} 与列 ${c1 + 1},${c2 + 1} 形成 X-Wing，删除其他格 ${v}`,
                  },
                ],
              };
            }
          }
        }
      }
      // 列版本：找两列，每列 v 恰好 2 个候选位置且行号相同
      const colRows: { c: number; rows: number[] }[] = [];
      for (let c = 0; c < 9; c++) {
        const rows: number[] = [];
        for (let r = 0; r < 9; r++) {
          if (grid.cands[r * 9 + c].has(v)) rows.push(r);
        }
        if (rows.length === 2) colRows.push({ c, rows });
      }
      for (let i = 0; i < colRows.length; i++) {
        for (let j = i + 1; j < colRows.length; j++) {
          if (
            colRows[i].rows[0] === colRows[j].rows[0] &&
            colRows[i].rows[1] === colRows[j].rows[1]
          ) {
            const r1 = colRows[i].rows[0];
            const r2 = colRows[i].rows[1];
            const c1 = colRows[i].c;
            const c2 = colRows[j].c;
            let changed = false;
            let target = -1;
            for (let c = 0; c < 9; c++) {
              if (c === c1 || c === c2) continue;
              for (const r of [r1, r2]) {
                const idx = r * 9 + c;
                if (grid.cands[idx].has(v)) {
                  grid.cands[idx].remove(v);
                  changed = true;
                  if (target < 0) target = idx;
                }
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
                    reason: `列 ${c1 + 1},${c2 + 1} 与行 ${r1 + 1},${r2 + 1} 形成 X-Wing，删除其他格 ${v}`,
                  },
                ],
              };
            }
          }
        }
      }
    }
    // 显式标记未使用辅助
    void rowOf;
    void colOf;
    return { applied: false, steps: [] };
  }
}
