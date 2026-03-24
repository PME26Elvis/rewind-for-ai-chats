import type { Platform, SourceType } from '@rewind/shared';

export interface AccountRecord {
  id: string;
  platform: Platform;
  displayLabel: string;
  colorGroup?: string;
  manualMergeGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  platform: Platform;
  accountId: string;
  workspaceLabel?: string;
  title?: string;
  sourceType: SourceType;
  sourceRef?: string;
  favorite: boolean;
  primaryColorGroup?: string;
  createdAt?: string;
  updatedAt?: string;
  importedAt: string;
  syncFingerprint?: string;
  parseConfidence?: number;
  rawJsonPath?: string;
  rawHtmlPath?: string;
  statsJson?: string;
}
