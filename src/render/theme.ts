// 主题配色：明确区分普通笼、隐藏笼、格间大小、笼间大小四种视觉元素
//   玩家可凭颜色一眼区分约束类型
export interface Theme {
  bg: string;
  gridLine: string;
  gridLineThick: string;
  cageBorder: string; // 笼边粗虚线（深红）
  cageLabelBg: string; // 普通笼和值标签底色（深）
  cageLabelFg: string;
  hiddenCageLabelBg: string; // 隐藏笼"?"标签底色（金）
  hiddenCageLabelFg: string;
  cellIneq: string; // 格间大小符号（深蓝）
  cageIneq: string; // 笼间大小符号（橙）
  cageIneqGuide: string; // 笼间符号引导虚线
  givenNumber: string;
  userInput: string;
  candidate: string;
  highlightSelected: string;
  highlightPeer: string;
  highlightSameValue: string;
  highlightCage: string;
  highlightConflict: string;
  highlightHint: string;
}

export const DEFAULT_THEME: Theme = {
  bg: '#fefefe',
  gridLine: '#d1d5db',
  gridLineThick: '#1f2937',
  cageBorder: '#b91c1c',
  cageLabelBg: '#1f2937',
  cageLabelFg: '#ffffff',
  hiddenCageLabelBg: '#f59e0b',
  hiddenCageLabelFg: '#ffffff',
  cellIneq: '#1e3a8a',
  cageIneq: '#f59e0b',
  cageIneqGuide: '#fbbf24',
  givenNumber: '#111827',
  userInput: '#1e40af',
  candidate: '#9ca3af',
  highlightSelected: '#fef3c7',
  highlightPeer: '#fef9c3',
  highlightSameValue: '#dbeafe',
  highlightCage: '#fed7aa',
  highlightConflict: '#ef4444',
  highlightHint: '#10b981',
};
