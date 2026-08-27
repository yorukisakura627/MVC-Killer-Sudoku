import { ALL_UNITS } from '@/types/grid';
import type { CandidateGrid } from '@/solver/candidates';
import type { Technique, TechniqueResult, TechCtx } from './types';

// Rule of 45：行/列/宫的数字之和恒为 45
//   若某 unit 内除一个隐藏笼外其他笼都已知和值，则该隐藏笼和 = 45 - 其他笼和
//   - 修改 ctx.cagesById 中隐藏笼的 sum 字段（直接赋具体值）
//   - 后续传播会自动用该和值收紧笼内候选（CageConstraint 引用同一 cage 对象）
//   - 难度等级 3，普通及更高级别使用
export class Rule45 implements Technique {
  readonly name = 'rule-45';
  readonly level = 3;
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult {
    void grid; // 本技巧不直接修改候选数，仅修改 cage.sum
    for (const unit of ALL_UNITS) {
      // 收集 unit 内完全包含的所有笼
      const unitSet = new Set(unit.cells);
      const cagesFullyIn: Map<number, { id: number; sum: number | null; cells: number[] }> = new Map();
      for (const idx of unit.cells) {
        const cageId = ctx.cageOfCell.get(idx);
        if (cageId === undefined) continue;
        if (cagesFullyIn.has(cageId)) continue;
        const cage = ctx.cagesById.get(cageId);
        if (!cage) continue;
        // 完全在 unit 内？
        const fully = cage.cells.every((c) => unitSet.has(c));
        if (fully) {
          cagesFullyIn.set(cageId, { id: cage.id, sum: cage.sum, cells: cage.cells });
        }
      }
      const cagesArr = [...cagesFullyIn.values()];
      const hidden = cagesArr.filter((c) => c.sum === null);
      const known = cagesArr.filter((c) => c.sum !== null);
      if (hidden.length === 1) {
        // 推断隐藏笼和
        const knownSum = known.reduce((s, c) => s + (c.sum as number), 0);
        const hiddenSum = 45 - knownSum;
        // 校验合理范围（笼 k 格最大和 = 9+8+...+(9-k+1)，最小和 = 1+2+...+k）
        const hiddenCage = ctx.cagesById.get(hidden[0].id);
        if (!hiddenCage) continue;
        const k = hiddenCage.cells.length;
        const minSum = (k * (k + 1)) / 2;
        const maxSum = (k * (19 - k)) / 2; // 9 + 8 + ... + (10-k)
        if (hiddenSum < minSum || hiddenSum > maxSum) continue;
        // 设置 sum
        hiddenCage.sum = hiddenSum;
        return {
          applied: true,
          steps: [
            {
              technique: this.name,
              target: hiddenCage.cells[0],
              value: 0,
              reason: `${unit.kind === 'row' ? '行' : unit.kind === 'col' ? '列' : '宫'} ${unit.index + 1} 和=45，其他笼和=${knownSum}，故此隐藏笼和=${hiddenSum}`,
            },
          ],
        };
      }
    }
    return { applied: false, steps: [] };
  }
}
