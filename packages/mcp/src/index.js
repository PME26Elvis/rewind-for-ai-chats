#!/usr/bin/env node
/**
 * Rewind MCP Server — exposes imported AI conversations to IDE agents.
 *
 * Tools:
 *   list_conversations   - List all imported conversations with metadata
 *   search_conversations - Full-text search across conversation titles & content
 *   read_conversation    - Read the full content of a specific conversation
 *   get_stats            - Get aggregate statistics about the archive
 *
 * Data source: reads JSON files from ~/.rewind/data/ (each file = one conversation)
 *
 * Usage:
 *   node packages/mcp/src/index.js
 *   (or configure as an MCP server in your IDE)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Data Directory ──────────────────────────────────────────────────────────
const DATA_DIR = process.env.REWIND_DATA_DIR || path.join(os.homedir(), '.rewind', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load all conversation JSON files from the data directory.
 */
function loadConversations() {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const conversations = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
      const json = JSON.parse(raw);
      conversations.push({
        id: json.id || path.basename(file, '.json'),
        title: json.title || 'Untitled',
        platform: detectPlatform(json),
        createTime: json.create_time ? new Date(json.create_time * 1000).toISOString() : null,
        updateTime: json.update_time ? new Date(json.update_time * 1000).toISOString() : null,
        messageCount: countMessages(json),
        filename: file,
        _raw: json,
      });
    } catch (e) {
      // Skip invalid files
    }
  }

  return conversations;
}

function detectPlatform(json) {
  if (json.mapping) return 'ChatGPT';
  if (json.model && json.model.includes('claude')) return 'Claude';
  if (json.model && json.model.includes('gemini')) return 'Gemini';
  if (json.model && json.model.includes('grok')) return 'Grok';
  return 'Unknown';
}

function countMessages(json) {
  if (json.mapping) {
    return Object.values(json.mapping).filter(
      (n) => n.message && n.message.content && n.message.author?.role !== 'system'
    ).length;
  }
  if (json.messages) return json.messages.length;
  return 0;
}

/**
 * Extract all text from a conversation for search.
 */
function extractText(json) {
  const parts = [];
  if (json.title) parts.push(json.title);

  if (json.mapping) {
    for (const node of Object.values(json.mapping)) {
      if (node.message?.content?.parts) {
        for (const part of node.message.content.parts) {
          if (typeof part === 'string') parts.push(part);
        }
      }
    }
  } else if (json.messages) {
    for (const msg of json.messages) {
      if (msg.text) parts.push(msg.text);
    }
  }
  return parts.join('\n');
}

/**
 * Format a conversation's messages as readable text.
 */
function formatConversation(json) {
  const lines = [];
  lines.push(`# ${json.title || 'Untitled Conversation'}`);
  lines.push('');

  if (json.mapping) {
    // Walk the tree (follow first child at each step = main branch)
    const mapping = json.mapping;
    let rootId = Object.keys(mapping).find(id => !mapping[id].parent);
    if (!rootId) rootId = Object.keys(mapping)[0];

    const visited = new Set();
    const queue = [rootId];
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = mapping[nodeId];
      if (node?.message?.content?.parts) {
        const role = node.message.author?.role || 'unknown';
        const text = node.message.content.parts.filter(p => typeof p === 'string').join('\n');
        if (text.trim() && role !== 'system') {
          const label = role === 'user' ? '## User' : role === 'assistant' ? '## Assistant' : `## ${role}`;
          const model = node.message.metadata?.model_slug;
          const time = node.message.create_time
            ? new Date(node.message.create_time * 1000).toLocaleString()
            : '';
          lines.push(label + (model ? ` (${model})` : '') + (time ? ` — ${time}` : ''));
          lines.push('');
          lines.push(text.trim());
          lines.push('');
        }
      }
      const children = node?.children || [];
      if (children.length > 0) queue.push(children[children.length - 1]); // latest branch
    }
  } else if (json.messages) {
    for (const msg of json.messages) {
      lines.push(`## ${msg.role || 'Unknown'}`);
      lines.push('');
      lines.push(msg.text || '');
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─── MCP Server ──────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'rewind-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_conversations',
      description: 'List all imported AI conversations with metadata (id, title, platform, date, message count). Optionally filter by platform.',
      inputSchema: {
        type: 'object',
        properties: {
          platform: { type: 'string', description: 'Filter by platform (ChatGPT, Claude, Gemini, Grok). Optional.' },
          limit: { type: 'number', description: 'Maximum number of results. Default: 50.' },
        },
      },
    },
    {
      name: 'search_conversations',
      description: 'Full-text search across conversation titles and message content. Returns matching conversations with excerpts.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query string.' },
          limit: { type: 'number', description: 'Maximum number of results. Default: 10.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_conversation',
      description: 'Read the full formatted content of a specific conversation by ID. Returns the conversation as markdown-formatted text.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Conversation ID.' },
        },
        required: ['id'],
      },
    },
    {
      name: 'get_stats',
      description: 'Get aggregate statistics about the conversation archive: total count, platform breakdown, date range, total messages.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_conversations': {
      let convos = loadConversations();
      if (args?.platform) {
        convos = convos.filter(c => c.platform.toLowerCase() === args.platform.toLowerCase());
      }
      const limit = args?.limit || 50;
      const results = convos.slice(0, limit).map(c => ({
        id: c.id,
        title: c.title,
        platform: c.platform,
        createTime: c.createTime,
        messageCount: c.messageCount,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    }

    case 'search_conversations': {
      const query = (args?.query || '').toLowerCase();
      if (!query) return { content: [{ type: 'text', text: 'Error: query is required.' }] };
      const limit = args?.limit || 10;
      const convos = loadConversations();
      const matches = [];

      for (const c of convos) {
        const fullText = extractText(c._raw);
        const lowerText = fullText.toLowerCase();
        const idx = lowerText.indexOf(query);
        if (idx !== -1) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(fullText.length, idx + query.length + 80);
          const excerpt = (start > 0 ? '...' : '') + fullText.substring(start, end).trim() + (end < fullText.length ? '...' : '');
          matches.push({
            id: c.id,
            title: c.title,
            platform: c.platform,
            excerpt,
          });
          if (matches.length >= limit) break;
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    }

    case 'read_conversation': {
      const id = args?.id;
      if (!id) return { content: [{ type: 'text', text: 'Error: id is required.' }] };
      const convos = loadConversations();
      const found = convos.find(c => c.id === id);
      if (!found) return { content: [{ type: 'text', text: `Error: Conversation "${id}" not found.` }] };
      const formatted = formatConversation(found._raw);
      return { content: [{ type: 'text', text: formatted }] };
    }

    case 'get_stats': {
      const convos = loadConversations();
      const platforms = {};
      let totalMessages = 0;
      let earliest = null;
      let latest = null;

      for (const c of convos) {
        platforms[c.platform] = (platforms[c.platform] || 0) + 1;
        totalMessages += c.messageCount;
        if (c.createTime) {
          if (!earliest || c.createTime < earliest) earliest = c.createTime;
          if (!latest || c.createTime > latest) latest = c.createTime;
        }
      }

      const stats = {
        totalConversations: convos.length,
        totalMessages,
        platforms,
        dateRange: { earliest, latest },
        dataDirectory: DATA_DIR,
      };
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
async function main() {
  ensureDataDir();
  console.error(`[rewind-mcp] Starting... Data directory: ${DATA_DIR}`);
  console.error(`[rewind-mcp] Tip: Place exported conversation JSON files in ${DATA_DIR}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[rewind-mcp] Server running on stdio.');
}

main().catch(console.error);
