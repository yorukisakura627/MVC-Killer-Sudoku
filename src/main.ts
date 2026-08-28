// 入口：三栏布局（左控制栏 / Canvas / 右数字键盘），加载题库，连接输入与渲染
import type { Difficulty, Puzzle } from '@/types/puzzle';
import {
  loadPuzzleSet,
  loadAllPuzzleSets,
  pickNextPuzzle,
  getPrevPuzzle,
  getNextPuzzle,
  getPuzzleList,
  type LoadProgress,
} from '@/puzzle-loader';
import { GameStore } from '@/state/game-store';
import { loadGame, applySave, getCompletedIds } from '@/state/persistence';
import { Renderer } from '@/render/canvas';
import { createView, type View } from '@/render/view';
import { PointerInput } from '@/input/pointer';
import { KeyboardInput } from '@/input/keyboard';
import type { InputAction } from '@/input/pointer';
import { SidePanel } from '@/ui/side-panel';
import { Numpad } from '@/ui/numpad';
import { showCompletionModal, showLoadingOverlay, showErrorOverlay, PauseOverlay, showHelpOverlay, showPuzzlePicker } from '@/ui/modal';

const app = document.getElementById('app')!;

let canvas: HTMLCanvasElement;
let canvasWrap: HTMLDivElement;
let controlsRow: HTMLDivElement;
let renderer: Renderer;
let view: View;
let store: GameStore;
let sidePanel: SidePanel;
let numpad: Numpad;
let pointer: PointerInput;
let keyboard: KeyboardInput;
// 暂停遮罩：延迟创建并放入 canvasWrap（覆盖表格本体）
let pauseOverlay: PauseOverlay | null = null;

async function main() {
  // 游戏区：表格在上、按键区在正下方（等宽于表格）
  const gameArea = document.createElement('div');
  gameArea.className = 'game-area';
  app.appendChild(gameArea);

  // 上：Canvas（相对定位容器，供暂停遮罩绝对覆盖）
  canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  canvas = document.createElement('canvas');
  canvasWrap.appendChild(canvas);
  gameArea.appendChild(canvasWrap);
  renderer = new Renderer(canvas);

  // 下：按键区（控制栏 | 数字键盘），宽度由 startPuzzle 设为表格宽度
  controlsRow = document.createElement('div');
  controlsRow.className = 'controls-row';
  gameArea.appendChild(controlsRow);

  // 左：控制栏（计时+题号+帮助 / 上一题·题目选择·下一题 / 难度）
  //   提示/检查按钮由右侧 Numpad 统一提供（含红圈剩余次数徽标与规则校验逻辑），
  //   左侧控制栏不再重复，避免功能冗余影响布局观感
  sidePanel = new SidePanel({
    onPrev: () => navigatePuzzle('prev'),
    onPick: () => showPuzzlePicker((d, i) => {
      const list = getPuzzleList(d);
      if (list[i]) startPuzzle(list[i]);
    }),
    onNext: () => navigatePuzzle('next'),
    onNewGame: (d) => startNewGame(d),
    onHelp: () => showHelpOverlay(),
  });
  controlsRow.appendChild(sidePanel.el);

  // 右：数字键盘 4×4
  numpad = new Numpad((a) => dispatch(a));
  controlsRow.appendChild(numpad.el);

  // 占位 view（待题目加载后填充）
  view = createView({
    id: '',
    difficulty: 'easy',
    solution: new Array(81).fill(0),
    cages: [],
    cellIneq: [],
    cageIneq: [],
    cellEq: [],
    cageEq: [],
    givens: new Map(),
    rating: 0,
    techniqueMax: '',
    steps: 0,
  } as Puzzle);

  // 默认难度
  let diff: Difficulty = 'easy';
  try {
    const s = localStorage.getItem('sudoku:settings');
    if (s) diff = (JSON.parse(s).defaultDifficulty as Difficulty) ?? 'easy';
  } catch {
    // ignore
  }

  await startNewGame(diff);
}

// 题库导航：上一题/下一题，环形循环；题库为空则回退到 startNewGame
function navigatePuzzle(kind: 'prev' | 'next'): void {
  if (!store) return;
  const diff = store.getDifficulty();
  const id = store.puzzle.id;
  const p = kind === 'prev' ? getPrevPuzzle(diff, id) : getNextPuzzle(diff, id);
  if (p) startPuzzle(p);
  else startNewGame(diff);
}

// 加载题库（启动时预加载三难度，用于全局编号与题目选择弹窗）并选取下一道未完成题
async function startNewGame(diff: Difficulty): Promise<void> {
  const loading = showLoadingOverlay(`加载题库…`);
  let puzzles: Puzzle[];
  try {
    await loadAllPuzzleSets((p: LoadProgress) => loading.update(p.message));
    puzzles = await loadPuzzleSet(diff);
  } catch (e) {
    loading.close();
    showErrorOverlay(`加载失败：${(e as Error).message}`, () => startNewGame(diff));
    return;
  }
  if (puzzles.length === 0) {
    loading.close();
    showErrorOverlay('题库为空，请运行 npm run gen-puzzles 生成题库', () => startNewGame(diff));
    return;
  }
  loading.close();
  const completed = getCompletedIds();
  const puzzle = pickNextPuzzle(diff, completed) ?? puzzles[0];
  startPuzzle(puzzle);
}

// 以给定题目启动一局（导航与首加载共用，题库已缓存）
function startPuzzle(puzzle: Puzzle): void {
  if (store) store.stopTimer();
  store = new GameStore(puzzle);
  // 开发模式挂全局调试钩子（浏览器 evaluate 测 store 行为用，生产无影响）
  //   未声明 vite/client 类型，使用 any 断言绕过 ImportMeta 字段检查
  const isDev = !!(import.meta as any).env?.DEV;
  if (isDev) {
    (window as any).__debug = { store };
  }
  // 恢复存档
  const save = loadGame(puzzle.id);
  if (save && !save.completed) {
    applySave(store, save);
  }

  // 同步 view
  view.puzzle = puzzle;
  view.cellSize = computeCellSize();
  view.origin = { x: 12, y: 12 };
  syncViewFromStore(view, store);

  // 调整 Canvas 尺寸
  const total = view.cellSize * 9 + view.origin.x * 2;
  renderer.resize(total, total);
  renderer.render(view);
  // 按键区宽度与表格一致（需求4：左右边缘对齐）
  controlsRow.style.width = total + 'px';

  // 启动计时
  store.startTimer();

  // 输入仅创建一次，避免重复绑定
  if (!pointer) {
    pointer = new PointerInput(canvas, () => view, (a) => dispatch(a));
  }
  if (!keyboard) {
    keyboard = new KeyboardInput(() => view, (a) => dispatch(a));
  }

  // 暂停遮罩首次创建并放入 canvasWrap（覆盖表格本体，非整页）
  if (!pauseOverlay) {
    pauseOverlay = new PauseOverlay(() => store.pauseTimer());
    canvasWrap.appendChild(pauseOverlay.el);
  }

  // 订阅状态变化（每次新 store 都订阅一次）
  store.subscribe((s) => {
    syncViewFromStore(view, s);
    renderer.render(view);
    sidePanel.update(s);
    numpad.update({
      candidateMode: s.candidateMode,
      canUndo: s.history.canUndo(),
      canReset: s.hasUserInput(),
      canHint: s.hintsRemaining > 0,
      hintsRemaining: s.hintsRemaining,
      paused: s.paused,
    });
    // 暂停时显示遮挡层，恢复时隐藏
    if (s.paused) {
      pauseOverlay!.show();
    } else {
      pauseOverlay!.hide();
    }
    if (s.completed) {
      showCompletionModal(s, () => startNewGame(s.getDifficulty()));
    }
  });
}

function dispatch(action: InputAction): void {
  switch (action.kind) {
    case 'select':
      store.select(action.idx);
      break;
    case 'selectMany':
      store.selectMulti(action.idxs);
      break;
    case 'value':
      store.inputValue(action.value);
      break;
    case 'toggleCand':
      store.toggleCand(action.value);
      break;
    case 'move':
      store.moveSel(action.dr, action.dc);
      break;
    case 'undo':
      store.undo();
      break;
    case 'redo':
      store.redo();
      break;
    case 'toggleCandMode':
      store.toggleCandMode();
      break;
    case 'hint':
      store.requestHint();
      break;
    case 'check':
      store.check();
      break;
    case 'pause':
      store.pauseTimer();
      break;
    case 'reset':
      store.resetPuzzle();
      break;
  }
}

function syncViewFromStore(v: View, s: GameStore): void {
  for (let i = 0; i < 81; i++) {
    v.cells[i].value = s.cells[i].value;
    v.cells[i].isGiven = s.cells[i].isGiven;
    v.cells[i].userCands = s.cells[i].userCands;
    v.cells[i].conflict = s.cells[i].conflict;
  }
  v.selected = s.selected;
  v.selectedSet = s.selectedSet;
  v.candidateMode = s.candidateMode;
  v.hintTarget = s.hintTarget;
}

// 根据视口尺寸自适应格子像素
function computeCellSize(): number {
  const vw = Math.min(window.innerWidth, 600);
  return Math.floor((vw - 32) / 9);
}

// 响应式：窗口大小变化时重算
window.addEventListener('resize', () => {
  if (!view || !store) return;
  view.cellSize = computeCellSize();
  const total = view.cellSize * 9 + view.origin.x * 2;
  renderer.resize(total, total);
  controlsRow.style.width = total + 'px';
  renderer.render(view);
});

main().catch((e) => {
  console.error(e);
  showErrorOverlay(`启动失败：${e.message}`);
});
