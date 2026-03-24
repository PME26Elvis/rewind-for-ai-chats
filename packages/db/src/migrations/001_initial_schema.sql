CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  display_label TEXT NOT NULL,
  color_group TEXT,
  manual_merge_group TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  workspace_label TEXT,
  title TEXT,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  favorite INTEGER NOT NULL DEFAULT 0,
  primary_color_group TEXT,
  created_at TEXT,
  updated_at TEXT,
  imported_at TEXT NOT NULL,
  sync_fingerprint TEXT,
  parse_confidence REAL,
  raw_json_path TEXT,
  raw_html_path TEXT,
  stats_json TEXT,
  FOREIGN KEY(account_id) REFERENCES accounts(id)
);

CREATE TABLE branches (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  root_message_id TEXT,
  leaf_message_id TEXT,
  derived_from_branch_id TEXT,
  branch_depth INTEGER NOT NULL DEFAULT 0,
  is_latest INTEGER NOT NULL DEFAULT 0,
  branch_label TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(derived_from_branch_id) REFERENCES branches(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  branch_id TEXT,
  parent_message_id TEXT,
  role TEXT NOT NULL,
  model TEXT,
  content_blocks_json TEXT NOT NULL,
  created_at TEXT,
  edited_at TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  char_count INTEGER NOT NULL DEFAULT 0,
  has_code INTEGER NOT NULL DEFAULT 0,
  has_images INTEGER NOT NULL DEFAULT 0,
  has_files INTEGER NOT NULL DEFAULT 0,
  source_metadata_json TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id),
  FOREIGN KEY(parent_message_id) REFERENCES messages(id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  kind TEXT NOT NULL,
  mime_type TEXT,
  filename TEXT,
  file_path TEXT,
  size_bytes INTEGER,
  created_at TEXT,
  source_metadata_json TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(message_id) REFERENCES messages(id)
);

CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  account_id TEXT NOT NULL,
  conversation_id TEXT,
  memory_kind TEXT NOT NULL,
  title TEXT,
  content TEXT,
  source_metadata_json TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(account_id) REFERENCES accounts(id),
  FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  artifact_kind TEXT NOT NULL,
  title TEXT,
  content_json TEXT,
  source_metadata_json TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(message_id) REFERENCES messages(id)
);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  args_json TEXT,
  result_json TEXT,
  source_metadata_json TEXT,
  created_at TEXT,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(message_id) REFERENCES messages(id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  message_id TEXT,
  tag_name TEXT NOT NULL,
  tag_scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id),
  FOREIGN KEY(message_id) REFERENCES messages(id)
);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  platform TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  pre_filters_json TEXT,
  detect_stats_json TEXT,
  result_stats_json TEXT,
  error_report_path TEXT
);

CREATE TABLE stats_cache (
  id TEXT PRIMARY KEY,
  cache_scope TEXT NOT NULL,
  scope_id TEXT,
  period_key TEXT,
  payload_json TEXT NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE INDEX idx_conversations_platform ON conversations(platform);
CREATE INDEX idx_conversations_account ON conversations(account_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_branch ON messages(branch_id);
CREATE INDEX idx_messages_role ON messages(role);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_tags_conversation ON tags(conversation_id);
CREATE INDEX idx_tags_message ON tags(message_id);
CREATE INDEX idx_attachments_conversation ON attachments(conversation_id);
CREATE INDEX idx_memories_account ON memories(account_id);
CREATE INDEX idx_stats_cache_scope ON stats_cache(cache_scope, scope_id, period_key);
