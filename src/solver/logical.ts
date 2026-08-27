import type { Puzzle } from '@/types/puzzle';
import type { Difficulty } from '@/types/puzzle';
import { CandidateGrid } from '@/solver/candidates';
import { Propagator } from '@/solver/propagator';
import { buildConstraintsFor } from '@/solver/constraints';
import { buildTechCtx, type Technique, type Step, type TechCtx } from './techniques/types';
import { NakedSingle } from './techniques/naked-single';
import { HiddenSingle } from './techniques/hidden-single';
import { CageCombos } from './techniques/cage-combos';
import { NakedPairs } from './techniques/naked-pairs';
import { HiddenPairs } from './techniques/hidden-pairs';
import { PointingPairs } from './techniques/pointing-pairs';
import { Rule45 } from './techniques/rule-45';
import { XWing } from './techniques/x-wing';

export interface SolveResult {
  solved: boolean;
  steps: Step[];
  stuck: boolean;
  maxLevel: number;
  techniqueMax: string;
}

// 简单档技巧：基础 3 技巧
export const EASY_TECHNIQUES: Technique[] = [
  new NakedSingle(),
  new HiddenSingle(),
  new CageCombos(),
];

// 普通档技巧：基础 + 进阶（数对、指向、45 法则）
export const NORMAL_TECHNIQUES: Technique[] = [
  ...EASY_TECHNIQUES,
  new NakedPairs(),
  new HiddenPairs(),
  new PointingPairs(),
  new Rule45(),
];

// 困难档技巧：普通 + X-Wing
//   格间大小与笼间大小传播由 Constraint 自动处理（不需要单独技巧）
export const HARD_TECHNIQUES: Technique[] = [...NORMAL_TECHNIQUES, new XWing()];

// 默认技巧列表：用 HARD（覆盖最高难度，逻辑求解器尽量求解）
export const DEFAULT_TECHNIQUES = HARD_TECHNIQUES;

// 按难度选技巧列表（生成器评分时使用对应难度的技巧）
export function techniquesFor(diff: Difficulty): Technique[] {
  switch (diff) {
    case 'easy':
      return EASY_TECHNIQUES;
    case 'normal':
      return NORMAL_TECHNIQUES;
    case 'hard':
      return HARD_TECHNIQUES;
  }
}

// 主求解器：交替"约束传播"与"技巧应用"直到完全解出或卡住
//   - 克隆 cages 供 rule-45 修改 sum 而不污染原 puzzle
//   - propagator 与 ctx 共享同一组克隆 cage 对象引用
export function solveLogical(
  p: Puzzle,
  techniques: Technique[] = DEFAULT_TECHNIQUES,
): SolveResult {
  const grid = CandidateGrid.fromPuzzle(p);

  // 克隆 cages：rule-45 等技巧可修改 cage.sum 而不污染原 puzzle
  const workCages = p.cages.map((c) => ({ id: c.id, cells: c.cells.slice(), sum: c.sum }));
  const cagesById = new Map(workCages.map((c) => [c.id, c]));
  const cageOfCell = new Map<number, number>();
  for (const c of workCages) {
    for (const idx of c.cells) cageOfCell.set(idx, c.id);
  }
  const ctx: TechCtx = { puzzle: p, cagesById, cageOfCell, resolved: new Set() };

  const propagator = new Propagator(buildConstraintsFor(workCages, p.cellIneq, p.cageIneq));

  const steps: Step[] = [];
  let maxLevel = 0;
  let techniqueMax = '';

  // 初始传播：处理给定数与已知约束
  if (!propagator.run(grid)) {
    return { solved: false, steps, stuck: true, maxLevel, techniqueMax };
  }

  let guard = 0;
  while (!grid.isSolved()) {
    if (++guard > 5000) {
      return { solved: false, steps, stuck: true, maxLevel, techniqueMax };
    }

    // 按技巧顺序尝试，第一个成功的就跳出
    let appliedAny = false;
    for (const tech of techniques) {
      const res = tech.apply(grid, ctx);
      if (res.applied) {
        steps.push(...res.steps);
        if (tech.level > maxLevel) {
          maxLevel = tech.level;
          techniqueMax = tech.name;
        }
        appliedAny = true;
        break;
      }
    }

    if (!appliedAny) {
      // 无技巧可用 → 卡住
      return { solved: false, steps, stuck: true, maxLevel, techniqueMax };
    }

    // 重新传播：应用技巧后约束会级联收敛
    if (!propagator.run(grid)) {
      return { solved: false, steps, stuck: true, maxLevel, techniqueMax };
    }
  }

  return { solved: true, steps, stuck: false, maxLevel, techniqueMax };
}

// 取下一步：用于前端"提示"按钮
//   输入当前 grid（应该已传播），输出一个 Step 并修改 grid（应用技巧）
//   返回 null 表示当前状态无可用技巧
export function nextStep(
  p: Puzzle,
  grid: CandidateGrid,
  techniques: Technique[] = DEFAULT_TECHNIQUES,
): Step | null {
  // 构造上下文，把当前已单值格标记为 resolved
  const ctx: TechCtx = (() => {
    const c = buildTechCtx(p);
    for (let i = 0; i < 81; i++) {
      if (grid.cands[i].isSingle()) c.resolved.add(i);
    }
    return c;
  })();
  for (const tech of techniques) {
    const res = tech.apply(grid, ctx);
    if (res.applied && res.steps.length > 0) {
      return res.steps[0];
    }
  }
  return null;
}

// 工具：当前 grid 重新传播到不动点
export function propagateGrid(p: Puzzle, grid: CandidateGrid): boolean {
  // 用克隆 cages 让传播不污染原 puzzle
  const workCages = p.cages.map((c) => ({ id: c.id, cells: c.cells.slice(), sum: c.sum }));
  const propagator = new Propagator(buildConstraintsFor(workCages, p.cellIneq, p.cageIneq));
  return propagator.run(grid);
}
