import type { Cage } from './cage';
import type { CellInequality, CageInequality, CellEquality, CageEquality, Rel } from './constraint';
import type { CellIdx } from './grid';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

// 笼的纯数据形态，用于题库 JSON 序列化（不含运行时方法）
export interface CageJson {
  cells: CellIdx[];
  sum: number | null;
}

// 题库 JSON schema：离线生成脚本输出、前端按难度抽取的最小格式
export interface PuzzleJson {
  id: string;
  difficulty: Difficulty;
  solution: number[]; // 长度 81 的完整解（0 表示空，1~9 为数字）
  cages: CageJson[];
  cellIneq: { a: CellIdx; b: CellIdx; rel: Rel }[];
  cageIneq: { a: number; b: number; rel: Rel }[]; // 仅连接 sum=null 的笼
  cellEq?: { a: CellIdx; b: CellIdx }[]; // 格间等值约束（可选，兼容旧题库）
  cageEq?: { a: number; b: number }[]; // 笼间等值约束（可选，兼容旧题库）
  givens: Record<number, number>; // CellIdx → 给定值
  rating: number; // 难度评分
  techniqueMax: string; // 用到的最高技巧
  steps: number; // 逻辑求解总步数
}

// 运行时 Puzzle：把 CageJson 补上 id 字段，便于内部引用
export interface Puzzle {
  id: string;
  difficulty: Difficulty;
  solution: number[];
  cages: Cage[];
  cellIneq: CellInequality[];
  cageIneq: CageInequality[];
  cellEq: CellEquality[];
  cageEq: CageEquality[];
  givens: Map<CellIdx, number>;
  rating: number;
  techniqueMax: string;
  steps: number;
}

// JSON → 运行时 Puzzle：补 Cage.id（按数组下标）
export function puzzleFromJson(json: PuzzleJson): Puzzle {
  const cages: Cage[] = json.cages.map((c, i) => ({
    id: i,
    cells: c.cells,
    sum: c.sum,
  }));
  return {
    id: json.id,
    difficulty: json.difficulty,
    solution: json.solution.slice(),
    cages,
    cellIneq: json.cellIneq.map((c) => ({ ...c })),
    cageIneq: json.cageIneq.map((c) => ({ ...c })),
    cellEq: (json.cellEq ?? []).map((c) => ({ ...c })),
    cageEq: (json.cageEq ?? []).map((c) => ({ ...c })),
    givens: new Map(Object.entries(json.givens).map(([k, v]) => [Number(k), v])),
    rating: json.rating,
    techniqueMax: json.techniqueMax,
    steps: json.steps,
  };
}

// 运行时 Puzzle → JSON：Map 序列化为对象
export function puzzleToJson(p: Puzzle): PuzzleJson {
  const givensObj: Record<number, number> = {};
  for (const [k, v] of p.givens) givensObj[k] = v;
  return {
    id: p.id,
    difficulty: p.difficulty,
    solution: p.solution.slice(),
    cages: p.cages.map((c) => ({ cells: c.cells.slice(), sum: c.sum })),
    cellIneq: p.cellIneq.map((c) => ({ ...c })),
    cageIneq: p.cageIneq.map((c) => ({ ...c })),
    cellEq: p.cellEq.map((c) => ({ ...c })),
    cageEq: p.cageEq.map((c) => ({ ...c })),
    givens: givensObj,
    rating: p.rating,
    techniqueMax: p.techniqueMax,
    steps: p.steps,
  };
}

// 当前格子是否是给定数（不可修改）
export function isGiven(p: Puzzle, idx: CellIdx): boolean {
  return p.givens.has(idx);
}
