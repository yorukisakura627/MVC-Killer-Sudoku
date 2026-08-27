import { describe, it, expect } from 'vitest';
import { solveBrute, hasUniqueSolution, isValidSolution } from '@/solver/backtrack';
import { makeSamplePuzzle, SAMPLE_SOLUTION } from './fixtures/sample-puzzle';

// 求解器基础测试：验证 solveBrute 与 isValidSolution 的正确性
describe('solveBrute', () => {
  it('全给定谜题应返回唯一解且与原解一致', () => {
    const p = makeSamplePuzzle();
    const sols = solveBrute(p, 2);
    expect(sols.length).toBe(1);
    expect(sols[0]).toEqual(SAMPLE_SOLUTION);
  });

  it('hasUniqueSolution 对全给定谜题应返回 true', () => {
    const p = makeSamplePuzzle();
    expect(hasUniqueSolution(p)).toBe(true);
  });

  it('cap 限制解的数量上限', () => {
    // 全给定谜题只有 1 解，cap=5 应仍只返回 1
    const p = makeSamplePuzzle();
    const sols = solveBrute(p, 5);
    expect(sols.length).toBe(1);
  });
});

describe('isValidSolution', () => {
  it('完整解应通过校验', () => {
    const p = makeSamplePuzzle();
    expect(isValidSolution(p, SAMPLE_SOLUTION.slice())).toBe(true);
  });

  it('错误解不应通过校验', () => {
    const p = makeSamplePuzzle();
    const wrong = SAMPLE_SOLUTION.slice();
    wrong[0] = wrong[0] === 5 ? 6 : 5; // 改第一格
    expect(isValidSolution(p, wrong)).toBe(false);
  });

  it('长度不足应拒绝', () => {
    const p = makeSamplePuzzle();
    expect(isValidSolution(p, [1, 2, 3])).toBe(false);
  });

  it('违反笼和应拒绝', () => {
    const p = makeSamplePuzzle();
    const bad = SAMPLE_SOLUTION.slice();
    // 把笼 0 的和从 12 改成别的：交换 (0,0) 与 (0,1) 位置上的值
    [bad[0], bad[1]] = [bad[1], bad[0]];
    expect(isValidSolution(p, bad)).toBe(false);
  });
});
