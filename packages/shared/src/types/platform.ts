export const PLATFORMS = ['chatgpt', 'gemini', 'claude', 'grok'] as const;
export type Platform = (typeof PLATFORMS)[number];

export type SourceType = 'json_export' | 'live_capture' | 'html_import' | 'manual_import' | 'folder_import';
export type WizardAction = 'import' | 'export';
