import type { Cage } from '@/types/cage';
import type { CellInequality, CageInequality, CellEquality, CageEquality } from '@/types/constraint';
import { ALL_UNITS } from '@/types/grid';
import type { CandidateGrid } from './candidates';
import type { Constraint } from './propagator';

// 通用工具：在给定的"目标剩余和范围 [targetLo, targetHi]"下收紧笼内自由格的候选
//   - 笼内已定值格的值累加为 fixedSum，自由格 freeCells
//   - 剩余和域 [remLo, remHi] = [targetLo - fixedSum, targetHi - fixedSum]
//   - 对每个自由格的每个候选 v，若"选 v 后剩余自由格无法凑出 [remLo, remHi]"则删 v
//   注意：其他自由格的 [min, max] 是基于当前候选集的宽松估计，未考虑笼内不重复
//   更深的精确枚举留给 cage-combos 技巧
export function tightenCageByRange(
  cage: Cage,
  targetLo: number,
  targetHi: number,
  g: CandidateGrid,
): boolean {
  let fixedSum = 0;
  const free: number[] = [];
  for (const idx of cage.cells) {
    const v = g.cands[idx].singleValue();
    if (v !== null) fixedSum += v;
    else free.push(idx);
  }
  if (free.length === 0) return false;
  const remLo = targetLo - fixedSum;
  const remHi = targetHi - fixedSum;

  // 各自由格候选集（数组形式，含排序后的 min/max）
  const freeArr = free.map((idx) => ({ idx, arr: g.cands[idx].toArray() }));
  // 不选某格时其余自由格的最小和 / 最大和
  let totalMin = 0;
  let totalMax = 0;
  for (const f of freeArr) {
    totalMin += f.arr[0];
    totalMax += f.arr[f.arr.length - 1];
  }

  let changed = false;
  for (const f of freeArr) {
    const myMin = f.arr[0];
    const myMax = f.arr[f.arr.length - 1];
    const othersMin = totalMin - myMin;
    const othersMax = totalMax - myMax;
    for (const v of f.arr) {
      // 选 v 后其余自由格需凑出 [remLo - v, remHi - v]
      // 若 [othersMin, othersMax] 与 [remLo - v, remHi - v] 不相交 → v 不可能
      if (othersMax < remLo - v || othersMin > remHi - v) {
        g.cands[f.idx].remove(v);
        changed = true;
      }
    }
  }
  return changed;
}

// 行/列/宫不重复约束：某格定值 v 后，单位内其它格删 v
export class UnitConstraint implements Constraint {
  readonly name = 'unit';
  prune(g: CandidateGrid): boolean {
    let changed = false;
    for (const unit of ALL_UNITS) {
      for (const idx of unit.cells) {
        const v = g.cands[idx].singleValue();
        if (v === null) continue;
        for (const other of unit.cells) {
          if (other === idx) continue;
          if (g.cands[other].has(v)) {
            g.cands[other].remove(v);
            changed = true;
          }
        }
      }
    }
    return changed;
  }
}

// 笼约束：笼内不重复 + 笼和域收紧（仅 sum !== null）
export class CageConstraint implements Constraint {
  readonly name = 'cage';
  constructor(private cage: Cage) {}
  prune(g: CandidateGrid): boolean {
    let changed = false;
    const cells = this.cage.cells;

    // 1. 笼内不重复：定值格的值从其他格候选删除
    for (let i = 0; i < cells.length; i++) {
      const v = g.cands[cells[i]].singleValue();
      if (v === null) continue;
      for (let j = 0; j < cells.length; j++) {
        if (i === j) continue;
        if (g.cands[cells[j]].has(v)) {
          g.cands[cells[j]].remove(v);
          changed = true;
        }
      }
    }

    // 2. 笼和域收紧
    if (this.cage.sum !== null) {
      if (tightenCageByRange(this.cage, this.cage.sum, this.cage.sum, g)) {
        changed = true;
      }
    }
    return changed;
  }
}

// 格间大小约束：a > b 表示 a 的所有候选 > b 的最小候选；b 的所有候选 < a 的最大候选
export class CellInequalityConstraint implements Constraint {
  readonly name = 'cell-ineq';
  constructor(private ineqs: CellInequality[]) {}
  prune(g: CandidateGrid): boolean {
    let changed = false;
    for (const { a, b, rel } of this.ineqs) {
      const aArr = g.cands[a].toArray();
      const bArr = g.cands[b].toArray();
      if (aArr.length === 0 || bArr.length === 0) continue;
      const bMin = bArr[0];
      const bMax = bArr[bArr.length - 1];
      const aMin = aArr[0];
      const aMax = aArr[aArr.length - 1];
      if (rel === '>') {
        // a > b ⇒ a 候选必须 > bMin，b 候选必须 < aMax
        for (const v of aArr) {
          if (v <= bMin) {
            g.cands[a].remove(v);
            changed = true;
          }
        }
        for (const v of bArr) {
          if (v >= aMax) {
            g.cands[b].remove(v);
            changed = true;
          }
        }
      } else {
        // a < b ⇒ a 候选必须 < bMax，b 候选必须 > aMin
        for (const v of aArr) {
          if (v >= bMax) {
            g.cands[a].remove(v);
            changed = true;
          }
        }
        for (const v of bArr) {
          if (v <= aMin) {
            g.cands[b].remove(v);
            changed = true;
          }
        }
      }
    }
    return changed;
  }
}

// 笼间大小约束：基于"隐藏和值笼"（sum=null）的和值可能域传播
//   - 隐藏笼 A 的和值域 [aLo, aHi]：由当前候选集 min/max 和推出
//   - A > B ⇒ aLo = max(aLo, bLo+1)、bHi = min(bHi, aHi-1)
//   - 用 tightenCageByRange 反向收紧格子候选
//   - 笼间约束可能级联（A>B>C 改变 B 的域后又会影响 A 与 C），外层 while 循环到稳定
export class CageInequalityConstraint implements Constraint {
  readonly name = 'cage-ineq';
  private cagesById: Map<number, Cage>;
  constructor(cages: Cage[], private ineqs: CageInequality[]) {
    this.cagesById = new Map(cages.map((c) => [c.id, c]));
  }
  private sumRange(cage: Cage, g: CandidateGrid): [number, number] {
    let lo = 0;
    let hi = 0;
    for (const idx of cage.cells) {
      const arr = g.cands[idx].toArray();
      lo += arr[0];
      hi += arr[arr.length - 1];
    }
    return [lo, hi];
  }
  prune(g: CandidateGrid): boolean {
    let changed = false;
    let outer = true;
    let guard = 0;
    while (outer) {
      if (++guard > 200) break;
      outer = false;
      for (const { a, b, rel } of this.ineqs) {
        const cageA = this.cagesById.get(a);
        const cageB = this.cagesById.get(b);
        if (!cageA || !cageB) continue;
        const [aLo, aHi] = this.sumRange(cageA, g);
        const [bLo, bHi] = this.sumRange(cageB, g);
        let newALo = aLo;
        let newAHi = aHi;
        let newBLo = bLo;
        let newBHi = bHi;
        if (rel === '>') {
          newALo = Math.max(aLo, bLo + 1);
          newBHi = Math.min(bHi, aHi - 1);
        } else {
          newAHi = Math.min(aHi, bHi - 1);
          newBLo = Math.max(bLo, aLo + 1);
        }
        if (newALo !== aLo || newAHi !== aHi) {
          if (tightenCageByRange(cageA, newALo, newAHi, g)) {
            changed = true;
            outer = true;
          }
        }
        if (newBLo !== bLo || newBHi !== bHi) {
          if (tightenCageByRange(cageB, newBLo, newBHi, g)) {
            changed = true;
            outer = true;
          }
        }
      }
    }
    return changed;
  }
}

// 格间等值约束：两格（非同行/列/宫）必须填相同数字
//   传播：两格候选集取交集（等值⇒两格只能取共同候选）；一格定值 ⇒ 另一格同值
export class CellEqualityConstraint implements Constraint {
  readonly name = 'cell-eq';
  constructor(private eqs: CellEquality[]) {}
  prune(g: CandidateGrid): boolean {
    let changed = false;
    for (const { a, b } of this.eqs) {
      const aArr = g.cands[a].toArray();
      const bArr = g.cands[b].toArray();
      if (aArr.length === 0 || bArr.length === 0) continue;
      const bSet = new Set(bArr);
      // a 候选 ∩ b 候选：a 中不在 b 候选集里的值全部删除
      for (const v of aArr) {
        if (!bSet.has(v)) {
          g.cands[a].remove(v);
          changed = true;
        }
      }
      // b 侧同理（a 集合在上一轮可能已变化，用原 bArr 重新对比最新的 a）
      const aSet = new Set(g.cands[a].toArray());
      for (const v of bArr) {
        if (!aSet.has(v)) {
          g.cands[b].remove(v);
          changed = true;
        }
      }
    }
    return changed;
  }
}

// 笼间等值约束：两笼和值相等（均须为隐藏和值笼）
//   传播：两笼和值域 [aLo,aHi] 与 [bLo,bHi] 收敛到公共区间
//   [lo,hi] = [max(aLo,bLo), min(aHi,bHi)]，再用 tightenCageByRange 反向收紧格子候选
export class CageEqualityConstraint implements Constraint {
  readonly name = 'cage-eq';
  private cagesById: Map<number, Cage>;
  constructor(cages: Cage[], private eqs: CageEquality[]) {
    this.cagesById = new Map(cages.map((c) => [c.id, c]));
  }
  private sumRange(cage: Cage, g: CandidateGrid): [number, number] {
    let lo = 0;
    let hi = 0;
    for (const idx of cage.cells) {
      const arr = g.cands[idx].toArray();
      lo += arr[0];
      hi += arr[arr.length - 1];
    }
    return [lo, hi];
  }
  prune(g: CandidateGrid): boolean {
    let changed = false;
    for (const { a, b } of this.eqs) {
      const cageA = this.cagesById.get(a);
      const cageB = this.cagesById.get(b);
      if (!cageA || !cageB) continue;
      const [aLo, aHi] = this.sumRange(cageA, g);
      const [bLo, bHi] = this.sumRange(cageB, g);
      // 等值 ⇒ 两笼和值域都收敛到公共交集
      const lo = Math.max(aLo, bLo);
      const hi = Math.min(aHi, bHi);
      if (lo > hi) continue; // 已矛盾，交给外层矛盾检测
      if (lo !== aLo || hi !== aHi) {
        if (tightenCageByRange(cageA, lo, hi, g)) changed = true;
      }
      if (lo !== bLo || hi !== bHi) {
        if (tightenCageByRange(cageB, lo, hi, g)) changed = true;
      }
    }
    return changed;
  }
}

// 从 Puzzle 一次性构造所有需要的 Constraint
export function buildConstraintsFor(
  cages: Cage[],
  cellIneqs: CellInequality[],
  cageIneqs: CageInequality[],
  cellEqs: CellEquality[] = [],
  cageEqs: CageEquality[] = [],
): Constraint[] {
  const list: Constraint[] = [new UnitConstraint()];
  for (const c of cages) list.push(new CageConstraint(c));
  if (cellIneqs.length > 0) list.push(new CellInequalityConstraint(cellIneqs));
  if (cageIneqs.length > 0) list.push(new CageInequalityConstraint(cages, cageIneqs));
  if (cellEqs.length > 0) list.push(new CellEqualityConstraint(cellEqs));
  if (cageEqs.length > 0) list.push(new CageEqualityConstraint(cages, cageEqs));
  return list;
}
