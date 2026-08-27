import type { GameStore } from './game-store';

// localStorage 持久化：自动存档 + 题库进度
//   key 命名：sudoku:save:{puzzleId} 存单局进度；sudoku:completed 存已通关列表

const SAVE_PREFIX = 'sudoku:save:';
const COMPLETED_KEY = 'sudoku:completed';
const SETTINGS_KEY = 'sudoku:settings';

export interface SaveData {
  puzzleId: string;
  cells: { value: number; userCands: number[] }[];
  selected: number;
  candidateMode: boolean;
  elapsedMs: number;
  completed: boolean;
}

// 把当前 store 序列化并保存
export function saveGame(store: GameStore): void {
  if (typeof localStorage === 'undefined') return;
  const data: SaveData = {
    puzzleId: store.puzzle.id,
    cells: store.cells.map((c) => ({
      value: c.value,
      userCands: [...c.userCands],
    })),
    selected: store.selected,
    candidateMode: store.candidateMode,
    elapsedMs: store.elapsedMs,
    completed: store.completed,
  };
  try {
    localStorage.setItem(SAVE_PREFIX + store.puzzle.id, JSON.stringify(data));
  } catch {
    // localStorage 满或禁用，忽略
  }
}

// 加载某题的存档（如有）
export function loadGame(puzzleId: string): SaveData | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(SAVE_PREFIX + puzzleId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

// 把存档应用到 store（恢复进度）
export function applySave(store: GameStore, data: SaveData): void {
  if (data.puzzleId !== store.puzzle.id) return;
  for (let i = 0; i < 81; i++) {
    const cell = store.cells[i];
    if (!cell.isGiven) {
      cell.value = data.cells[i].value;
      cell.userCands = new Set(data.cells[i].userCands);
    }
  }
  store.selected = data.selected;
  store.candidateMode = data.candidateMode;
  store.elapsedMs = data.elapsedMs;
  store.completed = data.completed;
}

// 删除某题存档（完成通关后清理）
export function clearSave(puzzleId: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SAVE_PREFIX + puzzleId);
}

// 题库进度：已通关的题目 ID 集合
export function getCompletedIds(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(COMPLETED_KEY) ?? '[]');
    return new Set(arr as string[]);
  } catch {
    return new Set();
  }
}

export function markCompleted(puzzleId: string): void {
  if (typeof localStorage === 'undefined') return;
  const set = getCompletedIds();
  if (set.has(puzzleId)) return;
  set.add(puzzleId);
  localStorage.setItem(COMPLETED_KEY, JSON.stringify([...set]));
}

// 用户偏好（如默认难度）
export interface UserSettings {
  defaultDifficulty?: 'easy' | 'normal' | 'hard';
}

export function loadSettings(): UserSettings {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveSettings(s: UserSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
