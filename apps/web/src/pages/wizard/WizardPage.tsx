import React, { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, UploadCloud } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { parseHtmlImport } from '@parsers'
import { refreshBrowserArchive } from '../../lib/browserArchiveStore'

interface ParsedChat {
  id: string
  title: string
  platform: string
  date: string
  msgCount: number
  hasImage: boolean
  isFavorite: boolean
  rawJson?: any
  importKey?: string
  sourceFile: string
}

const LEGACY_LIBRARY_KEY = 'rewind_mock_data'
const LEGACY_FULL_KEY = 'rewind_full_chats'
const DEBUG_LOG_KEY = 'rewind:import-debug-log'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function decodeQuotedPrintable(text: string): string {
  let body = text.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '=' && i + 2 < body.length) {
      const hex = body.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    bytes.push(body.charCodeAt(i))
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  } catch {
    return body
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.(json|html?|mhtml|mht)$/i, '').replace(/[_#]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeMessageText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function normalizePlatformLabel(value: string) {
  const normalized = String(value || '').toLowerCase()
  if (normalized.includes('chatgpt')) return 'ChatGPT'
  if (normalized.includes('gemini')) return 'Gemini'
  if (normalized.includes('claude')) return 'Claude'
  if (normalized.includes('grok')) return 'Grok'
  return value || 'ChatGPT'
}

function cleanupAssistantArtifacts(text: string) {
  return normalizeMessageText(String(text || '')
    .replace(/cite[^]+/g, '')
    .replace(/filecite[^]+/g, '')
    .replace(/複製提示詞/g, '')
    .replace(/\bCopy prompt\b/gi, '')
  )
}

function buildImportKey(platform: string, rawJson: any, title: string, msgCount: number) {
  const id = rawJson?.conversationId || rawJson?.conversation_id || rawJson?.uuid || rawJson?.id || ''
  const messages = Array.isArray(rawJson?.messages) ? rawJson.messages : []
  const first = messages[0]?.text || ''
  const last = messages.length > 0 ? messages[messages.length - 1]?.text || '' : ''
  return [String(platform || '').toLowerCase(), id || stripExtension(title), msgCount, String(first).slice(0, 120), String(last).slice(0, 120)].join('::')
}

function buildConversationIdentity(platform: string, rawJson: any, title: string, sourceFile = '') {
  const normalizedPlatform = String(platform || '').toLowerCase()
  const id = rawJson?.conversationId || rawJson?.conversation_id || rawJson?.uuid || rawJson?.id || ''
  if (id) return `${normalizedPlatform}::${String(id)}`
  const fallback = stripExtension(sourceFile || title).toLowerCase()
  return `${normalizedPlatform}::${fallback}`
}

function mergeImportedChats(existingSummaries: any[], existingFull: any[], chats: ParsedChat[]) {
  const fullIdentityMap = new Map<string, any>()
  const summaryIdentityMap = new Map<string, any>()

  for (const entry of existingFull) {
    const messageCount = Array.isArray(entry.rawJson?.messages) ? entry.rawJson.messages.length : 0
    const importKey = entry.importKey || buildImportKey(entry.platform, entry.rawJson, entry.title, messageCount)
    const identity = entry.identityKey || buildConversationIdentity(entry.platform, entry.rawJson, entry.title, entry.sourceFile)
    fullIdentityMap.set(identity, { ...entry, importKey, identityKey: identity })
  }

  for (const entry of existingSummaries) {
    const importKey = entry.importKey || buildImportKey(entry.platform, { conversationId: entry.conversationId, messages: [] }, entry.title, entry.msgCount || entry.messageCount || 0)
    const identity = entry.identityKey || buildConversationIdentity(entry.platform, { conversationId: entry.conversationId }, entry.title, entry.sourceFile)
    summaryIdentityMap.set(identity, { ...entry, importKey, identityKey: identity })
  }

  for (const chat of chats) {
    const importKey = chat.importKey || buildImportKey(chat.platform, chat.rawJson, chat.title, chat.msgCount)
    const identity = buildConversationIdentity(chat.platform, chat.rawJson, chat.title, chat.sourceFile)
    const existing = fullIdentityMap.get(identity) || summaryIdentityMap.get(identity)
    const id = existing?.id || chat.id
    summaryIdentityMap.set(identity, {
      id,
      title: chat.title,
      platform: chat.platform,
      date: chat.date,
      msgCount: chat.msgCount,
      hasImage: chat.hasImage,
      isFavorite: chat.isFavorite,
      sourceFile: chat.sourceFile,
      importKey,
      identityKey: identity,
      conversationId: chat.rawJson?.conversationId || chat.rawJson?.conversation_id || undefined,
    })
    fullIdentityMap.set(identity, {
      id,
      title: chat.title,
      platform: chat.platform,
      date: chat.date,
      rawJson: chat.rawJson,
      sourceFile: chat.sourceFile,
      importKey,
      identityKey: identity,
    })
  }

  return {
    summaries: Array.from(summaryIdentityMap.values()),
    full: Array.from(fullIdentityMap.values()),
  }
}

function parseGeminiInBrowser(fileName: string, rawText: string) {
  if (typeof DOMParser === 'undefined') return null
  const { html, url } = parseMhtmlRaw(rawText)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = (doc.querySelector('[data-test-id="conversation-title"]')?.textContent || doc.title || stripExtension(fileName)).trim()
  const messages = Array.from(doc.querySelectorAll('user-query, message-content')).map((node, index) => {
    const isUser = node.tagName.toLowerCase() === 'user-query'
    const rawText = isUser
      ? ((node.querySelector('.query-content') as HTMLElement | null)?.innerText || node.querySelector('.query-content')?.textContent || (node as HTMLElement).innerText || node.textContent || '').replace(/^(?:你說了|You said)\s+/i, '')
      : ((node.querySelector('.markdown-main-panel') as HTMLElement | null)?.innerText || (node as HTMLElement).innerText || node.textContent || '')
    const text = cleanupAssistantArtifacts(rawText)
    return {
      id: `${isUser ? 'user' : 'assistant'}-${index}`,
      role: isUser ? 'user' : 'assistant',
      text,
    }
  }).filter((message) => message.text)

  if (messages.length === 0) return null
  return {
    title,
    conversationId: url.match(/\/app\/([^?/#"']+)/i)?.[1] || stripExtension(fileName),
    platform: 'gemini',
    sourceFormat: /\.(mhtml|mht)$/i.test(fileName) ? 'mhtml' : 'html',
    url,
    messages,
  }
}


function parseMhtmlRaw(text: string): { html: string; url: string } {
  const urlMatch = text.match(/Snapshot-Content-Location:\s*(.+)/i)
  const url = urlMatch ? urlMatch[1].trim() : ''
  let decoded = text
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(text) || text.includes('=3D')) {
    decoded = decodeQuotedPrintable(text)
  }
  const htmlStart = decoded.search(/<!doctype html|<html/i)
  let html = htmlStart >= 0 ? decoded.slice(htmlStart) : decoded
  const htmlEnd = html.search(/<\/html>/i)
  if (htmlEnd >= 0) html = html.slice(0, htmlEnd + 7)
  return { html, url }
}

function parseHtmlFile(text: string, fileName: string): Omit<ParsedChat, 'id' | 'sourceFile'> {
  const parsed = parseHtmlImport(fileName, text)
  const fallbackGemini = parsed.platform === 'gemini' && parsed.messages.length < 2 ? parseGeminiInBrowser(fileName, text) : null
  const htmlResult = fallbackGemini || parsed
  const finalTitle = htmlResult.title && !['Google Gemini', 'Grok', 'ChatGPT', 'Claude'].includes(htmlResult.title) ? htmlResult.title : stripExtension(fileName)
  const { url } = parseMhtmlRaw(text)
  const rawJson = {
    title: finalTitle,
    conversationId: htmlResult.conversationId,
    platform: htmlResult.platform,
    url,
    sourceFormat: /\.(mhtml|mht)$/i.test(fileName) ? 'mhtml' : 'html',
    messages: htmlResult.messages
      .map((message, index) => ({
        id: message.id || String(index),
        role: message.role,
        text: cleanupAssistantArtifacts(message.text || '')
      }))
      .filter((message) => message.text)
  }

  const platform = normalizePlatformLabel(htmlResult.platform)
  return {
    title: rawJson.title,
    platform,
    date: (htmlResult.updatedAt || htmlResult.createdAt || new Date().toISOString()).split('T')[0],
    msgCount: rawJson.messages.length,
    hasImage: /<img/i.test(text),
    isFavorite: false,
    rawJson,
    importKey: buildImportKey(platform, rawJson, rawJson.title, rawJson.messages.length)
  }
}

function parseJsonImport(text: string, fileName: string): Omit<ParsedChat, 'id' | 'sourceFile'> {
  const parsed = JSON.parse(text)

  if (parsed?.schema === 'rewind-export/v1' && Array.isArray(parsed.messages)) {
    const platform = normalizePlatformLabel(parsed.platform || 'ChatGPT')
    const normalized = {
      title: parsed.title || stripExtension(fileName),
      conversationId: parsed.conversationId || stripExtension(fileName),
      platform: platform.toLowerCase(),
      sourceFormat: 'rewind-export',
      messages: parsed.messages
        .map((message: any, index: number) => ({
          id: message.id || `${index}`,
          role: message.role || 'assistant',
          text: cleanupAssistantArtifacts(message.text || ''),
          thinking: cleanupAssistantArtifacts(message.thinking || ''),
          createdAt: message.createdAt,
          model: message.model,
        }))
        .filter((message: any) => message.text || message.thinking)
    }
    return {
      title: normalized.title,
      platform,
      date: new Date(parsed.updatedAt || parsed.createdAt || Date.now()).toISOString().split('T')[0],
      msgCount: normalized.messages.length,
      hasImage: false,
      isFavorite: false,
      rawJson: normalized,
      importKey: buildImportKey(platform, normalized, normalized.title, normalized.messages.length),
    }
  }

  if (parsed.mapping && parsed.current_node) {
    const mapping = parsed.mapping
    const msgCount = Object.values(mapping).filter((node: any) => node.message?.content?.parts?.some((part: any) => typeof part === 'string' && part.trim())).length
    const timestamp = parsed.create_time ? (parsed.create_time > 10000000000 ? parsed.create_time : parsed.create_time * 1000) : Date.now()
    return {
      title: parsed.title || stripExtension(fileName),
      platform: 'ChatGPT',
      date: new Date(timestamp).toISOString().split('T')[0],
      msgCount,
      hasImage: text.includes('"image"') || text.includes('attachments'),
      isFavorite: false,
      rawJson: parsed,
      importKey: buildImportKey('ChatGPT', parsed, parsed.title || fileName, msgCount),
    }
  }

  if (parsed.platform === 'grok' || (Array.isArray(parsed.responseNodes) && Array.isArray(parsed.responses)) || Array.isArray(parsed.responses)) {
    const responseMap = new Map((parsed.responses || []).map((entry: any) => [entry.responseId, entry]))
    const responseNodes = Array.isArray(parsed.responseNodes) && parsed.responseNodes.length > 0
      ? parsed.responseNodes
      : (parsed.responses || []).map((entry: any) => ({ responseId: entry.responseId, sender: entry.sender }))
    const seen = new Set<string>()
    const messages = responseNodes
      .map((node: any) => {
        const content = responseMap.get(node.responseId) || {}
        const responseId = node.responseId || content.responseId
        if (responseId && seen.has(responseId)) return null
        if (responseId) seen.add(responseId)
        return {
          id: responseId || `${seen.size}`,
          role: node.sender === 'human' ? 'user' : 'assistant',
          text: cleanupAssistantArtifacts(typeof content.message === 'string' ? content.message : ''),
          createdAt: content.createTime,
          model: content?.metadata?.requestModelDetails?.modelId || content?.model,
        }
      })
      .filter((message: any) => message && message.text && message.text.trim())

    const normalized = {
      title: parsed.title || stripExtension(fileName),
      conversationId: parsed.conversationId || stripExtension(fileName),
      platform: 'grok',
      sourceFormat: 'grok-json',
      messages,
    }

    return {
      title: normalized.title,
      platform: 'Grok',
      date: new Date((parsed.responses?.[0]?.createTime || Date.now())).toISOString().split('T')[0],
      msgCount: normalized.messages.length,
      hasImage: text.includes('generatedImageUrls') || text.includes('imageAttachments'),
      isFavorite: false,
      rawJson: normalized,
      importKey: buildImportKey('Grok', normalized, normalized.title, normalized.messages.length),
    }
  }

  if (Array.isArray(parsed.messages) && (parsed.conversationId || parsed.platform === 'gemini' || parsed.platform === 'claude' || parsed.platform === 'grok')) {
    const platform = normalizePlatformLabel(parsed.platform || 'Gemini')
    const normalized = {
      title: parsed.title || stripExtension(fileName),
      conversationId: parsed.conversationId || stripExtension(fileName),
      platform: platform.toLowerCase(),
      sourceFormat: parsed.sourceFormat || 'flat-json',
      messages: parsed.messages
        .map((message: any, index: number) => ({
          id: message.id || `${index}`,
          role: message.role || 'assistant',
          text: cleanupAssistantArtifacts(message.text || ''),
          thinking: cleanupAssistantArtifacts(message.thinking || ''),
          createdAt: message.createdAt,
          model: message.model,
        }))
        .filter((message: any) => message.text || message.thinking)
    }

    return {
      title: normalized.title,
      platform,
      date: new Date(parsed.updatedAt || parsed.createdAt || Date.now()).toISOString().split('T')[0],
      msgCount: normalized.messages.length,
      hasImage: text.includes('<img') || text.includes('image'),
      isFavorite: false,
      rawJson: normalized,
      importKey: buildImportKey(platform, normalized, normalized.title, normalized.messages.length),
    }
  }

  throw new Error(`Unsupported JSON format: ${fileName}`)
}


function saveDebugLog(lines: string[], forceDownload = false) {
  const content = lines.join('\n')
  window.localStorage.setItem(DEBUG_LOG_KEY, content)
  ;(window as any).__rewindImportDebugLog = content
  if (forceDownload) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rewind-import-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    anchor.click()
    URL.revokeObjectURL(url)
  }
}

export function WizardPage() {
  const [isImporting, setIsImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const [stats, setStats] = useState({ count: 0, failed: 0 })
  const navigate = useNavigate()

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    const startedAt = performance.now()
    const logs: string[] = [`[${new Date().toISOString()}] import:start files=${files.length}`]
    setIsImporting(true)
    setImportDone(false)
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)))

    const chats: ParsedChat[] = []
    let failed = 0

    for (const file of files) {
      const fileStart = performance.now()
      logs.push(`[${new Date().toISOString()}] file:start name=${file.name} size=${file.size}`)
      try {
        const text = await file.text()
        const ext = file.name.split('.').pop()?.toLowerCase()
        const parsed = (ext === 'mhtml' || ext === 'mht' || ext === 'html' || ext === 'htm')
          ? parseHtmlFile(text, file.name)
          : parseJsonImport(text, file.name)
        chats.push({ id: crypto.randomUUID(), sourceFile: file.name, ...parsed })
        logs.push(`[${new Date().toISOString()}] file:done name=${file.name} platform=${parsed.platform} messages=${parsed.msgCount} durationMs=${Math.round(performance.now() - fileStart)}`)
      } catch (error: any) {
        failed += 1
        console.error(`Failed to parse ${file.name}:`, error)
        logs.push(`[${new Date().toISOString()}] file:error name=${file.name} message=${String(error?.message || error)}`)
      }
    }

    const existingSummaries = readJson<any[]>(LEGACY_LIBRARY_KEY, [])
    const existingFull = readJson<any[]>(LEGACY_FULL_KEY, [])
    const merged = mergeImportedChats(existingSummaries, existingFull, chats)

    writeJson(LEGACY_LIBRARY_KEY, merged.summaries)
    writeJson(LEGACY_FULL_KEY, merged.full)
    logs.push(`[${new Date().toISOString()}] storage:legacy summaries=${merged.summaries.length} full=${merged.full.length}`)

    // Rebuild the normalized browser archive from the freshly written legacy import store.
    // Do NOT clear legacy storage here, or the newly imported conversations disappear immediately.
    const snapshot = refreshBrowserArchive({ clearPersisted: true })
    logs.push(`[${new Date().toISOString()}] archive:refreshed conversations=${Object.keys(snapshot?.conversations || {}).length} messages=${Object.keys(snapshot?.messages || {}).length}`)

    const totalDuration = Math.round(performance.now() - startedAt)
    logs.push(`[${new Date().toISOString()}] import:done success=${chats.length} failed=${failed} durationMs=${totalDuration}`)
    saveDebugLog(logs, failed > 0)

    setStats({ count: chats.length, failed })
    setIsImporting(false)
    setImportDone(true)
  }, [])

  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <div className="mb-8">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="-ml-3 mb-4 gap-2 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Button>
        <h2 className="text-3xl font-bold tracking-tight mb-2">Import Data</h2>
        <p className="text-muted-foreground">Quickly import ChatGPT, Gemini, Claude, and Grok JSON / HTML / MHTML exports into your local archive.</p>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm p-10 flex flex-col items-center justify-center text-center min-h-[360px]">
        {isImporting ? (
          <div className="space-y-6 flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <h3 className="text-xl font-semibold">Processing files...</h3>
            <p className="text-sm text-muted-foreground">Reading and parsing conversation data locally.</p>
          </div>
        ) : importDone ? (
          <div className="space-y-6 flex flex-col items-center">
             <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center">
               <CheckCircle2 className="w-10 h-10" />
             </div>
             <h3 className="text-2xl font-bold">Import Complete!</h3>
             <p className="text-muted-foreground max-w-sm">
               Successfully imported <b>{stats.count}</b> conversation(s). Failed <b>{stats.failed}</b>. Debug log saved in localStorage key <code>{DEBUG_LOG_KEY}</code>.
             </p>
             <div className="flex gap-3 pt-4">
               <Button onClick={() => navigate('/library')}>View Library</Button>
               <Button variant="outline" onClick={() => setImportDone(false)}>Import More</Button>
             </div>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full max-w-lg p-12 border-2 border-primary border-dashed rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer relative group">
            <UploadCloud className="w-14 h-14 text-primary mb-4 group-hover:scale-110 transition-transform duration-300" />
            <span className="font-semibold text-lg">Click or Drag Files Here</span>
            <span className="text-sm text-muted-foreground mt-2 font-mono">.json · .html · .mhtml</span>
            <p className="text-xs text-muted-foreground mt-6 px-4">
              Select multiple files to bulk import. Data is processed entirely locally and never leaves your machine.
            </p>
            <input
              type="file"
              accept=".json,.html,.htm,.mhtml,.mht"
              multiple
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>
        )}
      </div>
    </div>
  )
}
