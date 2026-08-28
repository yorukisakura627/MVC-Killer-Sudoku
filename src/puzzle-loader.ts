import type { Difficulty, Puzzle } from '@/types/puzzle';
import { puzzleFromJson } from '@/types/puzzle';
import { generatePuzzle } from '@/generator/pipeline';

// 题库加载：优先 fetch 离线预生成的 JSON，失败时运行时实时生成（fallback）
//   前端启动时按当前难度 fetch；玩家通关后从该难度数组随机抽下一道未完成题
//   题库 JSON 总大小 < 100KB，瞬间加载；首次加载显示"题库准备中…"

const CACHE = new Map<Difficulty, Puzzle[]>();

export interface LoadProgress {
  phase: 'fetch' | 'gen' | 'done' | 'error';
  message: string;
}

// 加载某难度的题库
//   onProgress 用于在生成阶段显示进度提示
export async function loadPuzzleSet(
  diff: Difficulty,
  onProgress?: (p: LoadProgress) => void,
): Promise<Puzzle[]> {
  // 命中缓存直接返回
  const cached = CACHE.get(diff);
  if (cached && cached.length > 0) return cached;

  // 1. 尝试 fetch 离线题库 JSON
  //   加时间戳查询参数绕过浏览器缓存，避免读到旧的空文件
  try {
    onProgress?.({ phase: 'fetch', message: `加载 ${diffLabel(diff)} 题库…` });
    const resp = await fetch(`/puzzles/${diff}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.puzzles?.length > 0) {
        const puzzles = (data.puzzles as any[]).map(puzzleFromJson);
        CACHE.set(diff, puzzles);
        onProgress?.({ phase: 'done', message: '题库加载完成' });
        return puzzles;
      }
    }
  } catch {
    // 题库不存在，进入 fallback
  }

  // 2. Fallback：运行时实时生成（题库未生成时）
  onProgress?.({ phase: 'gen', message: `题库未生成，正在实时生成 ${diffLabel(diff)} 题目…` });
  const puzzles: Puzzle[] = [];
  // 串行生成，每题约 0.1~30s；最多生成 3 题
  for (let i = 0; i < 3; i++) {
    const p = generatePuzzle({ diff, maxTries: 5, timeoutMs: 10000 });
    if (p) puzzles.push(p);
    onProgress?.({
      phase: 'gen',
      message: `已生成 ${puzzles.length} 题…`,
    });
  }
  if (puzzles.length === 0) {
    onProgress?.({ phase: 'error', message: '生成失败，请稍后重试或运行 npm run gen-puzzles' });
    return [];
  }
  CACHE.set(diff, puzzles);
  onProgress?.({ phase: 'done', message: '题目生成完成' });
  return puzzles;
}

// 从某难度题库随机抽取一道未完成的题目（completedIds 为已完成集合）
export function pickNextPuzzle(
  diff: Difficulty,
  completedIds: Set<string>,
): Puzzle | null {
  const set = CACHE.get(diff);
  if (!set || set.length === 0) return null;
  const remaining = set.filter((p) => !completedIds.has(p.id));
  const pool = remaining.length > 0 ? remaining : set;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 清除缓存（切换难度时强制重新加载）
export function clearCache(diff?: Difficulty): void {
  if (diff) CACHE.delete(diff);
  else CACHE.clear();
}

// 题库导航（需求5）：环形循环，第一题的上一题=最后一题，最后一题的下一题=第一题
//   题库须已加载（loadPuzzleSet 已缓存），否则返回 null

// 取当前难度题库数组（导航与索引用）
export function getPuzzleList(diff: Difficulty): Puzzle[] {
  return CACHE.get(diff) ?? [];
}

// 上一题：currentId 在题库的索引 -1（环形）；找不到则返回第一题
export function getPrevPuzzle(diff: Difficulty, currentId: string): Puzzle | null {
  const list = getPuzzleList(diff);
  if (list.length === 0) return null;
  const i = list.findIndex((p) => p.id === currentId);
  if (i < 0) return list[0];
  return list[(i - 1 + list.length) % list.length];
}

// 下一题：currentId 在题库的索引 +1（环形）
export function getNextPuzzle(diff: Difficulty, currentId: string): Puzzle | null {
  const list = getPuzzleList(diff);
  if (list.length === 0) return null;
  const i = list.findIndex((p) => p.id === currentId);
  if (i < 0) return list[0];
  return list[(i + 1) % list.length];
}

// 随机题：在该难度随机选一道，排除当前题
export function getRandomPuzzle(diff: Difficulty, currentId: string): Puzzle | null {
  const list = getPuzzleList(diff);
  if (list.length === 0) return null;
  const pool = list.filter((p) => p.id !== currentId);
  const arr = pool.length > 0 ? pool : list;
  return arr[Math.floor(Math.random() * arr.length)];
}

// 预加载所有难度题库到 CACHE（需求2/3：全局编号与题目选择弹窗所需）
export async function loadAllPuzzleSets(
  onProgress?: (p: LoadProgress) => void,
): Promise<void> {
  const diffs: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
  for (const d of diffs) {
    if (CACHE.get(d)?.length) continue;
    await loadPuzzleSet(d, onProgress);
  }
}

// 全局题目序号（需求2）：按 easy→normal→hard→expert 顺序累计偏移，跨难度连续
//   新增题目时按难度顺序自动重算，更高难度的序号自动后移
export function getGlobalNumber(diff: Difficulty, localIdx: number): number {
  const order: Difficulty[] = ['easy', 'normal', 'hard', 'expert'];
  let offset = 0;
  for (const d of order) {
    if (d === diff) break;
    offset += getPuzzleList(d).length;
  }
  return offset + localIdx + 1;
}

// 序号格式化为 3 位补零（如 001）
export function formatPuzzleNo(n: number): string {
  return String(n).padStart(3, '0');
}

function diffLabel(diff: Difficulty): string {
  return diff === 'easy' ? '简单'
    : diff === 'normal' ? '普通'
    : diff === 'hard' ? '困难' : '专家';
}
