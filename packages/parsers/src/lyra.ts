import type { Platform } from '@rewind/shared';

export interface LyraParseResult {
  kind: 'lyra-json';
  platform: Platform;
  title: string;
  conversationId: string;
  createdAt?: string;
  messages: Array<{
    id: string;
    role: string;
    text: string;
    createdAt?: string;
  }>;
}

export function parseLyraExport(rawJson: string): LyraParseResult {
  let data: any;
  try {
    data = JSON.parse(rawJson);
  } catch (err) {
    throw new Error('Invalid JSON provided to Lyra parser');
  }

  const mapping = data.mapping || {};
  let currentNode = data.current_node;
  
  if (!currentNode && Object.keys(mapping).length > 0) {
    // If no current_node is explicitly set, try to find a leaf node (one with no children)
    const leaves = Object.values(mapping).filter((n: any) => !n.children || n.children.length === 0);
    if (leaves.length > 0) {
      currentNode = (leaves[0] as any).id;
    }
  }

  const messagePath: any[] = [];
  let curr = currentNode ? mapping[currentNode] : null;

  // Trace back from current_node to the root
  while (curr) {
    if (curr.message) {
      messagePath.push(curr.message);
    }
    curr = curr.parent ? mapping[curr.parent] : null;
  }

  // Path is leaf-to-root, so reverse it to get chronological order
  messagePath.reverse();

  const messages = messagePath.map(m => {
    let text = '';
    
    // the content can be text or tether_quote, etc.
    const content = m.content || {};
    if (content.parts && Array.isArray(content.parts)) {
      text = content.parts.join('\n');
    } else if (content.text) {
      text = content.text;
    }

    return {
      id: m.id,
      role: m.author?.role || 'assistant',
      text: text.trim(),
      createdAt: m.create_time ? new Date(m.create_time * 1000).toISOString() : undefined,
    };
  }).filter(m => m.text); // Filter out empty messages (like system prompts with no text)

  return {
    kind: 'lyra-json',
    platform: 'chatgpt', // Defaulting to chatgpt for standard Lyra exports unless platform specific tags exist
    title: data.title || 'Untitled Lyra Export',
    conversationId: data.conversation_id || `lyra-${Date.now()}`,
    createdAt: data.create_time ? new Date(data.create_time * 1000).toISOString() : undefined,
    messages
  };
}
