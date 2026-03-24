import React, { Component, ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Bot, Download, FileText, Image as ImageIcon, User } from 'lucide-react'
import { Button } from './ui/button'
import { useI18n } from '../i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import 'katex/dist/katex.min.css'
import { exportConversationJson, getConversationDetail, prettyPlatformName, subscribeArchive } from '../lib/browserArchiveStore'

class MarkdownErrorBoundary extends Component<{ children: ReactNode; fallback: string }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all">{this.props.fallback}</pre>
    }
    return this.props.children
  }
}



function fixMathDelimiters(text: string) {
  return String(text || '')
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, content) => `$$${content.trim()}$$`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, content) => `$${content.trim()}$`)
}

function filterImageReferences(text: string) {
  return String(text || '')
    .replace(/\[(?:圖片|附件|图像|image|attachment)\d*\s*[:：]\s*[^\]]+\]/gi, '')
    .replace(/\[(?:圖片|附件|图像|image|attachment)\d+\]/gi, '')
    .replace(/\[圖片[1-9]\]/gi, '')
    .trim()
}

function fixListItemMarkdown(text: string) {
  if (!text) return ''

  let fixed = text.replace(
    /(^|\n)([-*+]|\d+\.)\s+(.+?)(\n)(?![-*+\s]|\d+\.|\n)/gm,
    (_match, prefix, marker, content, newline) => `${prefix}${marker} ${content}${newline}${newline}`
  )

  fixed = fixed.replace(
    /(^|\n)([-*+]|\d+\.)\s+(.+?)($|\n)/gm,
    (_match, prefix, marker, content, suffix) => {
      const html = String(content)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
        .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
        .replace(/`([^`]+?)`/g, '<code>$1</code>')
      return `${prefix}${marker} ${html}${suffix}`
    }
  )

  return fixed
}

function prepareMarkdown(text: string) {
  return fixMathDelimiters(fixListItemMarkdown(filterImageReferences(String(text || ''))))
}

const MdComponents = {
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '')
    if (!inline && match) {
      return (
        <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" className="rounded-lg text-sm font-mono border border-white/10 my-4" {...props}>
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      )
    }
    return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-pink-400" {...props}>{children}</code>
  },
  table({ children, ...props }: any) {
    return <div className="overflow-x-auto my-4 rounded-lg border border-border"><table className="min-w-full divide-y divide-border" {...props}>{children}</table></div>
  },
  th({ children, ...props }: any) { return <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground bg-muted/50" {...props}>{children}</th> },
  td({ children, ...props }: any) { return <td className="px-3 py-2 text-sm border-t border-border/50" {...props}>{children}</td> },
  blockquote({ children, ...props }: any) { return <blockquote className="border-l-4 border-primary/50 pl-4 my-3 text-muted-foreground italic" {...props}>{children}</blockquote> },
  a({ href, children, ...props }: any) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...props}>{children}</a> },
  ul({ children, ...props }: any) { return <ul className="list-disc pl-5 my-2 space-y-1" {...props}>{children}</ul> },
  ol({ children, ...props }: any) { return <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol> },
  li({ children, ...props }: any) { return <li className="leading-relaxed" {...props}>{children}</li> },
  p({ children, ...props }: any) { return <p className="leading-relaxed mb-3 last:mb-0" {...props}>{children}</p> },
}

function ThinkingPanel({ thinking, label }: { thinking: string; label: string }) {
  if (!thinking) return null
  return (
    <details className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 open:bg-amber-500/10 transition-colors">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-amber-200 flex items-center gap-2 select-none">
        <span>💭</span>
        <span>{label}</span>
      </summary>
      <div className="px-4 pb-4 prose prose-sm prose-invert max-w-none text-foreground/90 break-words">
        <MarkdownErrorBoundary fallback={thinking}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath as any]} rehypePlugins={[rehypeRaw, rehypeKatex as any]} components={MdComponents}>
            {prepareMarkdown(thinking)}
          </ReactMarkdown>
        </MarkdownErrorBoundary>
      </div>
    </details>
  )
}

function MessageBlocks({ blocks }: { blocks: Array<any> }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'code') {
          return (
            <SyntaxHighlighter key={index} style={vscDarkPlus as any} language={block.language || 'text'} PreTag="div" className="rounded-lg text-sm font-mono border border-white/10 my-4">
              {String(block.text || '').replace(/\n$/, '')}
            </SyntaxHighlighter>
          )
        }
        if (block.type === 'image') {
          return (
            <div key={index} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground flex items-center gap-3">
              <ImageIcon className="w-4 h-4" />
              <div className="min-w-0 truncate">{block.alt || block.url || 'Imported image reference'}</div>
            </div>
          )
        }
        if (block.type === 'file') {
          return (
            <div key={index} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm text-muted-foreground flex items-center gap-3">
              <FileText className="w-4 h-4" />
              <div className="min-w-0 truncate">{block.filename || block.url || 'Imported file reference'}</div>
            </div>
          )
        }
        return (
          <div key={index} className="prose prose-sm prose-invert max-w-none text-foreground break-words">
            <MarkdownErrorBoundary fallback={block.text || ''}>
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath as any]} rehypePlugins={[rehypeRaw, rehypeKatex as any]} components={MdComponents}>
                {prepareMarkdown(block.text || '')}
              </ReactMarkdown>
            </MarkdownErrorBoundary>
          </div>
        )
      })}
    </div>
  )
}

export function ChatViewer() {
  const { chatId } = useParams<{ chatId: string }>()
  const { t } = useI18n()
  const [archiveVersion, setArchiveVersion] = useState(0)

  useEffect(() => subscribeArchive(() => setArchiveVersion((value) => value + 1)), [])

  const detail = useMemo(() => getConversationDetail(chatId || ''), [chatId, archiveVersion])

  const handleDownloadJson = () => {
    if (!detail) return
    const exportPayload = exportConversationJson(chatId || '') || detail
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${String(detail.conversation.title || 'chat').replace(/[^a-zA-Z0-9]/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!detail) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
        Conversation not found.
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/library">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight truncate">{detail.conversation.title || t('chatViewer.conversation')}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{prettyPlatformName(detail.conversation.platform)}</span>
                <span className="text-xs text-muted-foreground">{detail.messages.length} {t('chatViewer.messages')}</span>
                {detail.account?.displayLabel ? <span className="text-xs text-muted-foreground">· {detail.account.displayLabel}</span> : null}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadJson} className="gap-1 shrink-0">
            <Download className="w-3 h-3" /> {t('chatViewer.downloadJson')}
          </Button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-0">
        {detail.messages.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">{t('chatViewer.noMessages')}</div>
        ) : detail.messages.map((message: any, index: number) => (
          <div key={message.id || index} className={`py-6 ${index > 0 ? 'border-t border-border/40' : ''}`}>
            <div className="flex items-start gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${message.role === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{message.role === 'user' ? t('chatViewer.you') : message.role === 'assistant' ? t('chatViewer.ai') : message.role}</span>
                  {message.model ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{message.model}</span> : null}
                  {message.createdAt ? <span className="text-[10px] text-muted-foreground/60">{new Date(message.createdAt).toLocaleString()}</span> : null}
                </div>
                <ThinkingPanel thinking={message.thinking || ''} label={t('chatViewer.thinkingProcess')} />
                <MessageBlocks blocks={message.blocks || []} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
