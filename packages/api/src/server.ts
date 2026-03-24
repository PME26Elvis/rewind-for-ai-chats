import express from 'express';
import cors from 'cors';
import { executeImport } from '@rewind/core';
import { bootstrapArchiveDatabase, createArchiveRepository, replaceArchiveSnapshot } from '@rewind/db';
import { computeRewindAnalytics } from '@rewind/core';

const app = express();
const PORT = process.env.PORT || 8765;
const dbPath = './packages/db/rewind.sqlite';
const database = bootstrapArchiveDatabase(dbPath);
const repo = createArchiveRepository(database);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

function readSnapshot() {
  const accounts = Object.fromEntries(database.prepare('SELECT * FROM accounts').all().map((row: any) => [row.id, {
    id: row.id,
    platform: row.platform,
    displayLabel: row.display_label,
    colorGroup: row.color_group,
    manualMergeGroup: row.manual_merge_group,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }]));
  const conversations = Object.fromEntries(database.prepare('SELECT * FROM conversations').all().map((row: any) => [row.id, {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    workspaceLabel: row.workspace_label,
    title: row.title,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    favorite: Boolean(row.favorite),
    primaryColorGroup: row.primary_color_group,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    importedAt: row.imported_at,
    syncFingerprint: row.sync_fingerprint,
    parseConfidence: row.parse_confidence,
    rawJsonPath: row.raw_json_path,
    rawHtmlPath: row.raw_html_path,
    statsJson: row.stats_json
  }]));
  const branches = Object.fromEntries(database.prepare('SELECT * FROM branches').all().map((row: any) => [row.id, {
    id: row.id,
    conversationId: row.conversation_id,
    rootMessageId: row.root_message_id,
    leafMessageId: row.leaf_message_id,
    derivedFromBranchId: row.derived_from_branch_id,
    branchDepth: row.branch_depth,
    isLatest: Boolean(row.is_latest),
    branchLabel: row.branch_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }]));
  const messages = Object.fromEntries(database.prepare('SELECT * FROM messages').all().map((row: any) => [row.id, {
    id: row.id,
    conversationId: row.conversation_id,
    branchId: row.branch_id,
    parentMessageId: row.parent_message_id,
    role: row.role,
    model: row.model,
    contentBlocksJson: row.content_blocks_json,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    wordCount: row.word_count,
    charCount: row.char_count,
    hasCode: Boolean(row.has_code),
    hasImages: Boolean(row.has_images),
    hasFiles: Boolean(row.has_files),
    sourceMetadataJson: row.source_metadata_json
  }]));
  return { accounts, conversations, branches, messages, importJobs: {} };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0', name: 'rewind-local-api', dbActive: true });
});

app.post('/archive/import', (req, res) => {
  try {
    if (!req.body?.snapshot) return res.status(400).json({ error: 'Missing snapshot.' });
    replaceArchiveSnapshot(database, req.body.snapshot);
    const snapshot = readSnapshot();
    res.status(200).json({ success: true, counts: {
      accounts: Object.keys(snapshot.accounts).length,
      conversations: Object.keys(snapshot.conversations).length,
      messages: Object.keys(snapshot.messages).length
    } });
  } catch (error: any) {
    console.error('[Archive Import Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/import', (req, res) => {
  try {
    if (!Array.isArray(req.body?.files)) return res.status(400).json({ error: 'files[] is required.' });
    const result = executeImport(repo as any, req.body.files);
    res.status(200).json({ success: true, result });
  } catch (error: any) {
    console.error('[Import Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/search', (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'q is required.' });
    const results = (repo as any).searchConversationSnippets(query, Number(req.query.limit || 20));
    res.json({ results });
  } catch (error: any) {
    console.error('[Search Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/analytics', (req, res) => {
  try {
    const year = req.query.year === 'all' || !req.query.year ? 'all' : Number(req.query.year);
    res.json({ analytics: computeRewindAnalytics(readSnapshot() as any, year as any) });
  } catch (error: any) {
    console.error('[Analytics Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/library', (_req, res) => {
  try {
    res.json({ items: repo.listLibraryConversations() });
  } catch (error: any) {
    console.error('[Library Error]', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Rewind Local API is running at http://localhost:${PORT}`);
  console.log('Endpoints: /health, /archive/import, /import, /search, /analytics, /library');
});
