import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const initialSchema = readFileSync(join(currentDir, 'migrations/001_initial_schema.sql'), 'utf8');
const ftsSchema = readFileSync(join(currentDir, 'migrations/002_message_fts.sql'), 'utf8');

export const SQLITE_MIGRATIONS = [
  { version: '001_initial_schema', description: 'Create canonical archive tables, indexes, and schema migration registry.', sql: initialSchema },
  { version: '002_message_fts', description: 'Create FTS5 search index for imported message bodies.', sql: ftsSchema }
];

export const SIDECAR_LAYOUT = { databaseFile: 'rewind.sqlite', rawJsonDir: 'raw/json', rawHtmlDir: 'raw/html', reportsDir: 'reports' };

function applyMigrations(database) {
  const hasRegistry = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  if (!hasRegistry) {
    database.exec(initialSchema);
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run('001_initial_schema', new Date().toISOString());
  }

  for (const migration of SQLITE_MIGRATIONS.slice(1)) {
    const exists = database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version);
    if (!exists) {
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString());
    }
  }
}

export function bootstrapArchiveDatabase(filename = ':memory:') {
  const database = new DatabaseSync(filename);
  database.exec('PRAGMA foreign_keys = ON');
  applyMigrations(database);
  return database;
}

function toSqlBool(value) { return value ? 1 : 0; }

function extractTextFromContentBlocks(contentBlocksJson) {
  try {
    const blocks = JSON.parse(contentBlocksJson);
    if (!Array.isArray(blocks)) return '';
    return blocks.map((block) => {
      if (typeof block === 'string') return block;
      if (block.type === 'text' || block.type === 'code') return block.text || '';
      if (block.type === 'image') return block.alt || block.url || '';
      if (block.type === 'file') return block.filename || block.url || '';
      return block.text || '';
    }).join('\n');
  } catch {
    return '';
  }
}

function upsertFtsRow(database, message) {
  const conversation = database.prepare('SELECT platform, title FROM conversations WHERE id = ?').get(message.conversationId) || {};
  const body = extractTextFromContentBlocks(message.contentBlocksJson);
  database.prepare('DELETE FROM message_fts WHERE message_id = ?').run(message.id);
  database.prepare('INSERT INTO message_fts (message_id, conversation_id, platform, title, body) VALUES (?, ?, ?, ?, ?)')
    .run(message.id, message.conversationId, conversation.platform || '', conversation.title || '', body);
}

export function replaceArchiveSnapshot(database, snapshot) {
  database.exec('BEGIN');
  try {
    for (const table of ['message_fts', 'attachments', 'memories', 'messages', 'branches', 'conversations', 'accounts', 'import_jobs']) {
      try { database.exec(`DELETE FROM ${table}`); } catch {}
    }
    const repo = createArchiveRepository(database);
    for (const account of Object.values(snapshot.accounts || {})) repo.upsertAccount(account);
    for (const conversation of Object.values(snapshot.conversations || {})) repo.upsertConversation(conversation);
    for (const branch of Object.values(snapshot.branches || {})) repo.upsertBranch(branch);
    for (const message of Object.values(snapshot.messages || {})) repo.upsertMessage(message);
    for (const job of Object.values(snapshot.importJobs || {})) {
      if (job?.id) repo.insertImportJob(job);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function createArchiveRepository(database) {
  return {
    upsertAccount(account) {
      const result = database.prepare(`INSERT OR IGNORE INTO accounts (id, platform, display_label, color_group, manual_merge_group, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(account.id, account.platform, account.displayLabel, account.colorGroup ?? null, account.manualMergeGroup ?? null, account.notes ?? null, account.createdAt, account.updatedAt);
      if (result.changes === 0) database.prepare('UPDATE accounts SET display_label = ?, updated_at = ?, platform = ? WHERE id = ?').run(account.displayLabel, account.updatedAt, account.platform, account.id);
      return { inserted: result.changes > 0, id: account.id };
    },
    upsertConversation(conversation) {
      const result = database.prepare(`INSERT OR IGNORE INTO conversations (id, platform, account_id, workspace_label, title, source_type, source_ref, favorite, primary_color_group, created_at, updated_at, imported_at, sync_fingerprint, parse_confidence, raw_json_path, raw_html_path, stats_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(conversation.id, conversation.platform, conversation.accountId, conversation.workspaceLabel ?? null, conversation.title ?? null, conversation.sourceType, conversation.sourceRef ?? null, toSqlBool(conversation.favorite), conversation.primaryColorGroup ?? null, conversation.createdAt ?? null, conversation.updatedAt ?? null, conversation.importedAt, conversation.syncFingerprint ?? null, conversation.parseConfidence ?? null, conversation.rawJsonPath ?? null, conversation.rawHtmlPath ?? null, conversation.statsJson ?? null);
      if (result.changes === 0) database.prepare('UPDATE conversations SET title = ?, updated_at = ?, stats_json = ?, platform = ?, favorite = ? WHERE id = ?').run(conversation.title ?? null, conversation.updatedAt ?? null, conversation.statsJson ?? null, conversation.platform, toSqlBool(conversation.favorite), conversation.id);
      return { inserted: result.changes > 0, id: conversation.id };
    },
    upsertBranch(branch) {
      const result = database.prepare(`INSERT OR IGNORE INTO branches (id, conversation_id, root_message_id, leaf_message_id, derived_from_branch_id, branch_depth, is_latest, branch_label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(branch.id, branch.conversationId, branch.rootMessageId ?? null, branch.leafMessageId ?? null, branch.derivedFromBranchId ?? null, branch.branchDepth, toSqlBool(branch.isLatest), branch.branchLabel ?? null, branch.createdAt ?? null, branch.updatedAt ?? null);
      return { inserted: result.changes > 0, id: branch.id };
    },
    upsertMessage(message) {
      const result = database.prepare(`INSERT OR IGNORE INTO messages (id, conversation_id, branch_id, parent_message_id, role, model, content_blocks_json, created_at, edited_at, word_count, char_count, has_code, has_images, has_files, source_metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(message.id, message.conversationId, message.branchId ?? null, message.parentMessageId ?? null, message.role, message.model ?? null, message.contentBlocksJson, message.createdAt ?? null, message.editedAt ?? null, message.wordCount, message.charCount, toSqlBool(message.hasCode), toSqlBool(message.hasImages), toSqlBool(message.hasFiles), message.sourceMetadataJson ?? null);
      if (result.changes === 0) {
        database.prepare('UPDATE messages SET content_blocks_json = ?, edited_at = ?, word_count = ?, char_count = ?, has_code = ?, has_images = ?, has_files = ?, source_metadata_json = ?, role = ?, model = ? WHERE id = ?')
          .run(message.contentBlocksJson, message.editedAt ?? null, message.wordCount, message.charCount, toSqlBool(message.hasCode), toSqlBool(message.hasImages), toSqlBool(message.hasFiles), message.sourceMetadataJson ?? null, message.role, message.model ?? null, message.id);
      }
      upsertFtsRow(database, message);
      return { inserted: result.changes > 0, id: message.id };
    },
    insertImportJob(job) {
      database.prepare(`INSERT OR REPLACE INTO import_jobs (id, job_type, platform, started_at, finished_at, status, pre_filters_json, detect_stats_json, result_stats_json, error_report_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(job.id, job.jobType, job.platform ?? null, job.startedAt, job.finishedAt ?? null, job.status, job.preFiltersJson ?? null, job.detectStatsJson ?? null, job.resultStatsJson ?? null, job.errorReportPath ?? null);
    },
    updateImportJob(jobId, patch) {
      const current = database.prepare('SELECT * FROM import_jobs WHERE id = ?').get(jobId) || {};
      database.prepare(`UPDATE import_jobs SET finished_at = ?, status = ?, result_stats_json = ?, detect_stats_json = ?, error_report_path = ?, platform = ?, pre_filters_json = ? WHERE id = ?`).run(patch.finishedAt ?? current.finished_at ?? null, patch.status ?? current.status, patch.resultStatsJson ?? current.result_stats_json ?? null, patch.detectStatsJson ?? current.detect_stats_json ?? null, patch.errorReportPath ?? current.error_report_path ?? null, patch.platform ?? current.platform ?? null, patch.preFiltersJson ?? current.pre_filters_json ?? null, jobId);
    },
    listLibraryConversations() {
      return database.prepare(`SELECT conversations.id, COALESCE(conversations.title, '(untitled)') AS title, conversations.platform, accounts.display_label AS accountLabel, conversations.updated_at AS updatedAt, (SELECT COUNT(*) FROM messages WHERE messages.conversation_id = conversations.id) AS messageCount, (SELECT COUNT(*) FROM branches WHERE branches.conversation_id = conversations.id) AS branchCount FROM conversations INNER JOIN accounts ON accounts.id = conversations.account_id ORDER BY COALESCE(conversations.updated_at, conversations.imported_at) DESC, conversations.title ASC`).all();
    },
    searchConversationSnippets(query, limit = 20) {
      return database.prepare(`SELECT message_fts.conversation_id AS conversationId, message_fts.platform AS platform, message_fts.title AS title, snippet(message_fts, 4, '⟨', '⟩', ' … ', 24) AS snippet FROM message_fts WHERE message_fts MATCH ? ORDER BY rank LIMIT ?`).all(query, limit);
    }
  };
}
