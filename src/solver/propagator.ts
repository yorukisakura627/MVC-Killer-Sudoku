import type { CandidateGrid } from './candidates';

// 统一约束接口：所有约束（笼子和值/笼内不重复/行/列/宫/大小/45 法则）实现这个接口
//   prune 返回 true 表示本次产生了改变；返回 false 表示未改变
//   若在传播中发现矛盾，prune 可抛出 PropagationError 或返回 false 由调用方检查空候选
export interface Constraint {
  readonly name: string;
  prune(g: CandidateGrid): boolean;
}

export class PropagationError extends Error {
  constructor(message = '候选数传播矛盾') {
    super(message);
    this.name = 'PropagationError';
  }
}

// 传播引擎：循环调用所有约束直到稳定不动点，或检测到矛盾
export class Propagator {
  private constraints: Constraint[];

  constructor(constraints: Constraint[]) {
    this.constraints = constraints.slice();
  }

  add(c: Constraint): void {
    this.constraints.push(c);
  }

  // 运行到不动点；返回 false 表示出现矛盾（候选数为空）
  run(g: CandidateGrid): boolean {
    let changed = true;
    let safetyGuard = 0; // 防御性循环上限，理论上不应触发
    while (changed) {
      if (++safetyGuard > 10000) {
        throw new PropagationError('传播引擎异常循环');
      }
      changed = false;
      for (const c of this.constraints) {
        if (c.prune(g)) {
          changed = true;
          if (g.hasContradiction()) return false; // 出现空候选，矛盾
        }
      }
    }
    return !g.hasContradiction();
  }

  // 单步推进：仅扫一遍所有约束，不再循环
  // 用于逻辑求解器在每步技巧触发后做单轮清理，便于追踪"步骤改变了什么"
  step(g: CandidateGrid): boolean {
    let changed = false;
    for (const c of this.constraints) {
      if (c.prune(g)) {
        changed = true;
        if (g.hasContradiction()) return false;
      }
    }
    return changed && !g.hasContradiction();
  }
}
