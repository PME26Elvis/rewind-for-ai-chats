CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  message_id UNINDEXED,
  conversation_id UNINDEXED,
  platform UNINDEXED,
  title UNINDEXED,
  body
);
