export interface Cue {
  id: string;
  startSeconds: number;
  endSeconds: number;
  arabic: string;
  english: string;
  edited?: boolean;
}

export interface Project {
  videoPath: string;
  audioPath: string;
  durationSeconds: number;
  cues: Cue[];
  history: Cue[][];
  future: Cue[][];
  createdAt: number;
  projectFilePath?: string;
  youtubeUrl?: string;
  audioOnly?: boolean;
  manualMedia?: ManualMedia[];
}

export interface Settings {
  model: 'gemini-2.5-pro' | 'gemini-2.5-flash';
  chunkMinutes: number;
  maxConcurrentChunks: number;
  showCostEstimate: boolean;
}

export type AppScreen = 'import' | 'processing' | 'editor' | 'clips' | 'youtube';

export type SegmentDurationRange = '4-6' | '7-10' | '11-15' | '15-20';

export interface ReviewIssue {
  id: string
  cueId: string
  type: 'transcription' | 'translation' | 'islamic_phrase' | 'grammar'
  problem: string
  suggestedArabic?: string
  suggestedEnglish?: string
  confidence: 'high' | 'medium' | 'low'
  status: 'pending' | 'approved' | 'dismissed'
}

export interface VideoSegment {
  id: string;
  title: string;
  topicSummary: string;
  startSeconds: number;
  endSeconds: number;
  cues: Cue[];
  selected: boolean;
}

export interface Clip {
  id: string;
  title: string;
  reason: string;
  startSeconds: number;
  endSeconds: number;
  cues: Cue[];
  selected: boolean;
}

export interface ManualMedia {
  id: string;
  title: string;
  kind: 'clip' | 'segment';
  startSeconds: number;
  endSeconds: number;
  cues: Cue[];
  selected: boolean;
}

export interface ProcessingProgress {
  stage: 'extracting' | 'transcribing' | 'translating' | 'finalizing';
  stageProgress: number;
  currentChunk?: number;
  totalChunks?: number;
  log: string[];
  error?: string;
  videoPath?: string;
  audioOnly?: boolean;
  youtubeUrl?: string;
}

export interface SubtitleStyle {
  fontSize: 'small' | 'medium' | 'large' | 'xl' | 'xxl';
  position: 'bottom' | 'center' | 'top';
  background: 'none' | 'semi' | 'solid';
  includeArabic: boolean;
}

export interface LogoSettings {
  path: string | null
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  size: 'small' | 'medium' | 'large'
  opacity: 100 | 75 | 50 | 25
  enabled: boolean
}

export interface ExportOptions {
  mode: 'srt' | 'soft' | 'hard';
  fontSize?: 'small' | 'medium' | 'large' | 'xl' | 'xxl';
  position?: 'bottom' | 'center' | 'top';
  background?: 'none' | 'semi' | 'solid';
  includeArabic?: boolean;
}
