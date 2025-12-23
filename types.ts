export enum WorkflowStep {
  ANALYSIS = 1,
  TEMPLATE = 2,
  IDEATION = 3,
  GENERATION = 4
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

export interface AppState {
  step: WorkflowStep;
  referenceScript: string;
  analysis: ScriptAnalysis | null;
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