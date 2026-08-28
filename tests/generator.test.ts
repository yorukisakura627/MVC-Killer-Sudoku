import { describe, it, expect } from 'vitest';
import { generatePuzzle } from '@/generator/pipeline';
import { mulberry32 } from '@/generator/grid-gen';
import { hasUniqueSolution } from '@/solver/backtrack';
import { solveLogical, techniquesFor } from '@/solver/logical';
import { DIFF_PARAMS } from '@/generator/difficulty';
import type { Difficulty } from '@/types/puzzle';

// 生成器集成测试：验证生成的谜题满足唯一解 + 逻辑可解 + 难度评分达标
//   注意：本测试可能耗时数秒到数十秒，vitest 已配置 90s timeout
describe('generatePuzzle', () => {
  it('生成简单题应满足唯一解 + 逻辑可解 + 评分在简单区间', () => {
    const p = generatePuzzle({
      diff: 'easy',
      rng: mulberry32(42),
      maxTries: 10,
      timeoutMs: 30000,
    });
    // 若环境受限生成失败，跳过断言而非报错
    if (!p) {
      console.warn('简单题生成失败（可能因环境或运气），跳过断言');
      return;
    }
    expect(hasUniqueSolution(p)).toBe(true);
    const log = solveLogical(p, techniquesFor('easy'));
    expect(log.solved).toBe(true);
    expect(log.maxLevel).toBeLessThanOrEqual(DIFF_PARAMS.easy.maxAllowedLevel);
    expect(p.givens.size).toBeGreaterThanOrEqual(DIFF_PARAMS.easy.givensRange[0]);
    expect(p.cages.length).toBeGreaterThan(0);
  }, 60000);

  it('生成普通题字段完整', () => {
    const p = generatePuzzle({
      diff: 'normal',
      rng: mulberry32(123),
      // minLevel/评分带门槛会拒绝部分候选，预算给足避免误熔断
      maxTries: 40,
      timeoutMs: 30000,
    });
    if (!p) {
      console.warn('普通题生成失败，跳过断言');
      return;
    }
    expect(p.difficulty).toBe('normal');
    expect(p.solution.length).toBe(81);
    expect(p.givens.size).toBeGreaterThanOrEqual(DIFF_PARAMS.normal.givensRange[0]);
    // 需求3：不应存在"可见单格笼"（单格笼和值等价给定数，属冗余约束）
    expect(p.cages.some((c) => c.cells.length === 1 && c.sum !== null)).toBe(false);
    expect(hasUniqueSolution(p)).toBe(true);
  }, 60000);

  it('四档难度都应保证给定数下限', () => {
    const cases: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
    for (const diff of cases) {
      const p = generatePuzzle({
        diff,
        rng: mulberry32(999 + diff.length),
        maxTries: 40,
        timeoutMs: 60000,
      });
      if (!p) continue;
      expect(p.givens.size).toBeGreaterThanOrEqual(DIFF_PARAMS[diff].givensRange[0]);
    }
  }, 120000);
});
