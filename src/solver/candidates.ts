import { CELL_COUNT } from '@/types/grid';
import type { Puzzle } from '@/types/puzzle';

// 9 位掩码：第 i 位（1 << (i-1)）表示候选数字 i 存在
// 用位掩码而非数组，是为了 O(1) 增删与 O(1) 集合运算
export const ALL_MASK = 0b111111111; // 候选 {1..9}
const BIT: Record<number, number> = {};
for (let v = 1; v <= 9; v++) BIT[v] = 1 << (v - 1);

export class CandSet {
  bits: number;
  constructor(bits = ALL_MASK) {
    this.bits = bits;
  }
  has(v: number): boolean {
    return (this.bits & BIT[v]) !== 0;
  }
  add(v: number): void {
    this.bits |= BIT[v];
  }
  remove(v: number): boolean {
    // 返回是否真的删掉了
    const had = this.has(v);
    this.bits &= ~BIT[v];
    return had;
  }
  clear(): void {
    this.bits = 0;
  }
  get size(): number {
    // popcount
    let n = 0;
    let x = this.bits;
    while (x) {
      n += x & 1;
      x >>>= 1;
    }
    return n;
  }
  isEmpty(): boolean {
    return this.bits === 0;
  }
  isSingle(): boolean {
    // 仅一个候选
    return this.size === 1;
  }
  singleValue(): number | null {
    if (!this.isSingle()) return null;
    let v = 1;
    let x = this.bits;
    while ((x & 1) === 0) {
      x >>>= 1;
      v++;
    }
    return v;
  }
  toArray(): number[] {
    const out: number[] = [];
    for (let v = 1; v <= 9; v++) if (this.has(v)) out.push(v);
    return out;
  }
  clone(): CandSet {
    return new CandSet(this.bits);
  }
  assign(other: CandSet): void {
    this.bits = other.bits;
  }
  intersect(other: CandSet): CandSet {
    return new CandSet(this.bits & other.bits);
  }
  union(other: CandSet): CandSet {
    return new CandSet(this.bits | other.bits);
  }
  subtract(other: CandSet): CandSet {
    return new CandSet(this.bits & ~other.bits);
  }
  equals(other: CandSet): boolean {
    return this.bits === other.bits;
  }
}

// 整个网格的候选数集合
export class CandidateGrid {
  cands: CandSet[];
  constructor() {
    this.cands = Array.from({ length: CELL_COUNT }, () => new CandSet());
  }
  clone(): CandidateGrid {
    const g = new CandidateGrid();
    for (let i = 0; i < CELL_COUNT; i++) g.cands[i] = this.cands[i].clone();
    return g;
  }
  // 从谜题初始化：给定格直接收缩到单值，其它格默认 {1..9}
  static fromPuzzle(p: Puzzle): CandidateGrid {
    const g = new CandidateGrid();
    for (const [idx, val] of p.givens) g.cands[idx] = new CandSet(BIT[val]);
    return g;
  }
  // 把某格设为确定值（用于求解过程中下值后剔除候选）
  setValue(idx: number, v: number): void {
    this.cands[idx] = new CandSet(BIT[v]);
  }
  isSolved(): boolean {
    return this.cands.every((c) => c.isSingle());
  }
  hasContradiction(): boolean {
    return this.cands.some((c) => c.isEmpty());
  }
  // 提取扁平解数组（仅当全部解出时才完整）
  toSolution(): number[] {
    const out = new Array<number>(CELL_COUNT).fill(0);
    for (let i = 0; i < CELL_COUNT; i++) {
      const v = this.cands[i].singleValue();
      if (v !== null) out[i] = v;
    }
    return out;
  }
}

export { BIT };
