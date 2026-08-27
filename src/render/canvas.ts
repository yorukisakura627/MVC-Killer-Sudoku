import type { View } from './view';
import type { Theme } from './theme';
import { DEFAULT_THEME } from './theme';
import type { RenderLayer } from './layers/types';
import { gridLines } from './layers/grid-lines';
import { cageBorders } from './layers/cage-borders';
import { cageLabels } from './layers/cage-labels';
import { inequalities } from './layers/inequalities';
import { highlights } from './layers/highlights';
import { numbers } from './layers/numbers';
import { candidates } from './layers/candidates';

// 渲染顺序：网格 → 高亮 → 笼边 → 笼标签 → 大小符号 → 候选 → 数字
//   候选移到数字之前：有值格子的候选小字在四角，中央大数字在上层覆盖中央候选
//   数字始终在最顶层，保证确定值清晰可读
const LAYERS: RenderLayer[] = [
  gridLines,
  highlights,
  cageBorders,
  cageLabels,
  inequalities,
  candidates,
  numbers,
];

export interface RendererOptions {
  theme?: Theme;
  dpr?: number; // 设备像素比，移动端高清
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private theme: Theme;
  private dpr: number;

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = opts.theme ?? DEFAULT_THEME;
    this.dpr = opts.dpr ?? (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  }

  // 调整 Canvas 尺寸（CSS 像素 + 物理像素）
  resize(cssW: number, cssH: number): void {
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // 主渲染入口：清空 + 按层绘制
  render(view: View): void {
    const ctx = this.ctx;
    const cssW = parseFloat(this.canvas.style.width) || this.canvas.width;
    const cssH = parseFloat(this.canvas.style.height) || this.canvas.height;
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, cssW, cssH);
    for (const layer of LAYERS) {
      layer.draw(ctx, view, this.theme);
    }
  }
}
