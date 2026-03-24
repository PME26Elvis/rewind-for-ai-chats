import { DatabaseSync } from 'node:sqlite';
import initialSchema from './migrations/001_initial_schema.sql?raw';
import type { AccountRecord, ConversationRecord } from '@rewind/core';
import type { ArchiveRepository, BranchRecord, ImportJobRecord, LibraryConversationSummary, MessageRecord } from '@rewind/core';

export interface MigrationDefinition {
  version: string;
  description: string;
  sql: string;
}

export const SQLITE_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '001_initial_schema',
    description: 'Create canonical archive tables, indexes, and schema migration registry.',
    sql: initialSchema
  }
];

export const SIDECAR_LAYOUT = {
  databaseFile: 'rewind.sqlite',
  rawJsonDir: 'raw/json',
  rawHtmlDir: 'raw/html',
  reportsDir: 'reports'
} as const;

export function bootstrapArchiveDatabase(filename = ':memory:') {
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON');
  const hasSchemaMigrations = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get() as { name?: string } | undefined;
  if (!hasSchemaMigrations?.name) {
    database.exec(initialSchema);
    database.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run('001_initial_schema', new Date().toISOString());
  }
  return database;
}

function toSqlBool(value: boolean) {
  return value ? 1 : 0;
}

export function createArchiveRepository(database: DatabaseSync): ArchiveRepository {
  return {
    upsertAccount(account: AccountRecord) {
      const result = database.prepare(`INSERT OR IGNORE INTO accounts (id, platform, display_label, color_group, manual_merge_group, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(account.id, account.platform, account.displayLabel, account.colorGroup ?? null, account.manualMergeGroup ?? null, account.notes ?? null, account.createdAt, account.updatedAt);
      if (result.changes === 0) {
        database.prepare('UPDATE accounts SET display_label = ?, updated_at = ? WHERE id = ?').run(account.displayLabel, account.updatedAt, account.id);
      }
      return { inserted: result.changes > 0, id: account.id };
    },
    upsertConversation(conversation: ConversationRecord) {
      const result = database.prepare(`INSERT OR IGNORE INTO conversations (id, platform, account_id, workspace_label, title, source_type, source_ref, favorite, primary_color_group, created_at, updated_at, imported_at, sync_fingerprint, parse_confidence, raw_json_path, raw_html_path, stats_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(conversation.id, conversation.platform, conversation.accountId, conversation.workspaceLabel ?? null, conversation.title ?? null, conversation.sourceType, conversation.sourceRef ?? null, toSqlBool(conversation.favorite), conversation.primaryColorGroup ?? null, conversation.createdAt ?? null, conversation.updatedAt ?? null, conversation.importedAt, conversation.syncFingerprint ?? null, conversation.parseConfidence ?? null, conversation.rawJsonPath ?? null, conversation.rawHtmlPath ?? null, conversation.statsJson ?? null);
      if (result.changes === 0) {
        database.prepare('UPDATE conversations SET title = ?, updated_at = ?, stats_json = ? WHERE id = ?').run(conversation.title ?? null, conversation.updatedAt ?? null, conversation.statsJson ?? null, conversation.id);
      }
      return { inserted: result.changes > 0, id: conversation.id };
    },
    upsertBranch(branch: BranchRecord) {
      const result = database.prepare(`INSERT OR IGNORE INTO branches (id, conversation_id, root_message_id, leaf_message_id, derived_from_branch_id, branch_depth, is_latest, branch_label, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(branch.id, branch.conversationId, branch.rootMessageId ?? null, branch.leafMessageId ?? null, branch.derivedFromBranchId ?? null, branch.branchDepth, toSqlBool(branch.isLatest), branch.branchLabel ?? null, branch.createdAt ?? null, branch.updatedAt ?? null);
      return { inserted: result.changes > 0, id: branch.id };
    },
    upsertMessage(message: MessageRecord) {
      const result = database.prepare(`INSERT OR IGNORE INTO messages (id, conversation_id, branch_id, parent_message_id, role, model, content_blocks_json, created_at, edited_at, word_count, char_count, has_code, has_images, has_files, source_metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(message.id, message.conversationId, message.branchId ?? null, message.parentMessageId ?? null, message.role, message.model ?? null, message.contentBlocksJson, message.createdAt ?? null, message.editedAt ?? null, message.wordCount, message.charCount, toSqlBool(message.hasCode), toSqlBool(message.hasImages), toSqlBool(message.hasFiles), message.sourceMetadataJson ?? null);
      return { inserted: result.changes > 0, id: message.id };
    },
    insertImportJob(job: ImportJobRecord) {
      database.prepare(`INSERT INTO import_jobs (id, job_type, platform, started_at, finished_at, status, pre_filters_json, detect_stats_json, result_stats_json, error_report_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(job.id, job.jobType, job.platform ?? null, job.startedAt, job.finishedAt ?? null, job.status, job.preFiltersJson ?? null, job.detectStatsJson ?? null, job.resultStatsJson ?? null, job.errorReportPath ?? null);
    },
    updateImportJob(jobId: string, patch: Partial<ImportJobRecord>) {
      const current = database.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) as ImportJobRecord;
      database.prepare(`UPDATE import_jobs SET finished_at = ?, status = ?, result_stats_json = ?, detect_stats_json = ?, error_report_path = ?, platform = ?, pre_filters_json = ? WHERE id = ?`)
        .run(patch.finishedAt ?? current.finishedAt ?? null, patch.status ?? current.status, patch.resultStatsJson ?? current.resultStatsJson ?? null, patch.detectStatsJson ?? current.detectStatsJson ?? null, patch.errorReportPath ?? current.errorReportPath ?? null, patch.platform ?? current.platform ?? null, patch.preFiltersJson ?? current.preFiltersJson ?? null, jobId);
    },
    listLibraryConversations() {
      return database.prepare(`SELECT conversations.id, COALESCE(conversations.title, '(untitled)') AS title, conversations.platform, accounts.display_label AS accountLabel,
        conversations.updated_at AS updatedAt,
        (SELECT COUNT(*) FROM messages WHERE messages.conversation_id = conversations.id) AS messageCount,
        (SELECT COUNT(*) FROM branches WHERE branches.conversation_id = conversations.id) AS branchCount
        FROM conversations
        INNER JOIN accounts ON accounts.id = conversations.account_id
        ORDER BY COALESCE(conversations.updated_at, conversations.imported_at) DESC, conversations.title ASC`).all() as LibraryConversationSummary[];
    }
  };
}
