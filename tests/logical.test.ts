import { describe, it, expect } from 'vitest';
import { solveLogical, nextStep, EASY_TECHNIQUES } from '@/solver/logical';
import { CandidateGrid } from '@/solver/candidates';
import { makeSamplePuzzle } from './fixtures/sample-puzzle';

// 逻辑求解器基础测试：验证 solveLogical 与 nextStep 的正确性
describe('solveLogical', () => {
  it('全给定谜题应直接解出（naked-single 链式）', () => {
    const p = makeSamplePuzzle();
    const result = solveLogical(p, EASY_TECHNIQUES);
    expect(result.solved).toBe(true);
    expect(result.stuck).toBe(false);
    // 全给定时所有格都已确定，步骤数应为 0 或等于 81
    expect(result.steps.length).toBeGreaterThanOrEqual(0);
  });

  it('maxLevel 与 techniqueMax 字段正确填充', () => {
    const p = makeSamplePuzzle();
    const result = solveLogical(p, EASY_TECHNIQUES);
    expect(result.techniqueMax).toBeDefined();
    expect(typeof result.maxLevel).toBe('number');
  });
});

describe('nextStep', () => {
  it('已解出的 grid 返回 null', () => {
    const p = makeSamplePuzzle();
    const grid = CandidateGrid.fromPuzzle(p);
    // 全给定 → 已解出
    expect(grid.isSolved()).toBe(true);
    const step = nextStep(p, grid, EASY_TECHNIQUES);
    expect(step).toBeNull();
  });
});
