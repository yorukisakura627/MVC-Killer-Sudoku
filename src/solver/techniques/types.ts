import type { Cage } from '@/types/cage';
import type { CandidateGrid } from '@/solver/candidates';
import type { Puzzle } from '@/types/puzzle';

// 单步推理描述：记录求解过程，供"提示"功能与"不靠猜"验证使用
export interface Step {
  technique: string; // 技巧名称
  target: number; // CellIdx
  value: number; // 该格定值；若是"删候选"类步骤，value=0 表示未定值
  reason: string; // 自然语言说明
}

// 技巧应用结果：是否产生新信息 + 步骤描述列表
//   一个技巧可一次产生多步（如 NakedSingle 一次扫描所有新单值格）
export interface TechniqueResult {
  applied: boolean;
  steps: Step[];
}

// 技巧上下文：预先建好的查询结构，避免每次实时计算
export interface TechCtx {
  puzzle: Puzzle;
  cagesById: Map<number, Cage>;
  cageOfCell: Map<number, number>; // CellIdx → Cage.id
  // 已被记录为"已解出"的格子集合——避免重复记录步骤
  // 由 logical 求解器维护，技巧可读不可写
  resolved: Set<number>;
}

// 技巧接口：在传播到不动点后调用，尝试主动产生新信息
export interface Technique {
  readonly name: string;
  readonly level: number; // 难度等级 1=最易，递增
  apply(grid: CandidateGrid, ctx: TechCtx): TechniqueResult;
}

// 工具：从 Puzzle 构造 TechCtx
export function buildTechCtx(p: Puzzle): TechCtx {
  const cagesById = new Map(p.cages.map((c) => [c.id, c]));
  const cageOfCell = new Map<number, number>();
  for (const c of p.cages) {
    for (const idx of c.cells) cageOfCell.set(idx, c.id);
  }
  return { puzzle: p, cagesById, cageOfCell, resolved: new Set() };
}
