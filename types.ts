export enum WorkflowStep {
  ANALYSIS = 1,
  TEMPLATE = 2,
  IDEATION = 3,
  HOOK_ASSEMBLY = 4,
  GENERATION = 5
}

export interface ScriptAnalysis {
  structure: string;
  tone: string;
  hooks: string;
  pacing: string;
  stylisticElements: string;
}

export interface Topic {
  title: string;
  explanation: string;
  citationLinks?: string[];
}

export interface PublicationAssets {
  videoCaptions: string[];
  coverTitles: string[];
  pinnedComments: string[];
  wechatSalesCopy: string;
}

export interface HookOption {
  style: string;
  content: string;
  template: string; // 包含占位符的模板，如 "为什么历史上那些{label}的人，最后都{end}？"
  slots: {
    [key: string]: {
      current: string;
      options: string[];
      label: string;
    };
  };
}

export interface AssemblyData {
  positiveLabel: string;
  tragicEnd: string;
  cases: string[];
  coreKeyword: string;
}

export interface AppState {
  step: WorkflowStep;
  referenceScript: string;
  analysis: string | null;
  hookOptions: HookOption[];
  selectedHookIndex: number;
  useAssembly: boolean;
  csvTemplate: string;
  confirmedCsv: string;
  topicDirection: string;
  customTopic: string;
  targetWordCount: number;
  selectedTopic: Topic | null;
  topics: Topic[];
  finalScript: string;
  finalEditedScript: string;
  publicationAssets: PublicationAssets | null;
  isLoading: boolean;
  error: string | null;
}
