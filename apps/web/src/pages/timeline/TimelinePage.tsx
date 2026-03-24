import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { getLibraryItems, subscribeArchive } from '../../lib/browserArchiveStore'
import { useI18n } from '../../i18n'

const PLATFORM_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  chatgpt: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
  gemini: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-500' },
  claude: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  grok: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500' },
}

function getMonthKey(dateStr?: string): string {
  if (!dateStr) return 'Unknown'
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(key: string): string {
  if (key === 'Unknown') return 'Unknown Date'
  const [year, month] = key.split('-')
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function TimelinePage() {
  const { t } = useI18n()
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set())
  const [archiveVersion, setArchiveVersion] = useState(0)

  useEffect(() => subscribeArchive(() => setArchiveVersion((value) => value + 1)), [])

  const chats = useMemo(() => getLibraryItems(), [archiveVersion])

  const monthGroups = useMemo(() => {
    const groups: Record<string, any[]> = {}
    for (const chat of chats) {
      const key = getMonthKey(chat.updatedAt || chat.createdAt || chat.importedAt)
      if (!groups[key]) groups[key] = []
      groups[key].push(chat)
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    }
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map((key) => ({ key, label: formatMonthLabel(key), chats: groups[key] }))
  }, [chats])

  const platformCounts = useMemo(() => chats.reduce((acc: Record<string, number>, chat: any) => {
    acc[chat.platform] = (acc[chat.platform] || 0) + 1
    return acc
  }, {}), [chats])

  const toggleMonth = (key: string) => {
    setCollapsedMonths((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (chats.length === 0) {
    return (
      <main className="flex-1 space-y-6 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">{t('timeline.title')}</h2>
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">{t('timeline.noDataTitle')}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">{t('timeline.noDataDesc')}</p>
          <Link to="/import" className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
            {t('timeline.goToImport')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('timeline.title')}</h2>
          <p className="text-muted-foreground">{t('timeline.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{chats.length} {t('timeline.conversations')}</span>
          <span>·</span>
          <span>{monthGroups.length} {t('timeline.months')}</span>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(platformCounts).map(([platform, count]) => {
          const colors = PLATFORM_COLORS[platform] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' }
          return (
            <div key={platform} className="flex items-center gap-2 text-sm">
              <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
              <span className={colors.text}>{platform}</span>
              <span className="text-muted-foreground/60">({count})</span>
            </div>
          )
        })}
      </div>

      <div className="relative ml-4">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />
        {monthGroups.map(({ key, label, chats: monthChats }) => {
          const isCollapsed = collapsedMonths.has(key)
          return (
            <div key={key} className="mb-8">
              <button onClick={() => toggleMonth(key)} className="relative flex items-center gap-3 mb-4 group cursor-pointer">
                <div className="w-7 h-7 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center z-10">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                </div>
                <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">{label}</h3>
                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{monthChats.length} conversations</span>
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {!isCollapsed && (
                <div className="space-y-2 ml-0.5">
                  {monthChats.map((chat: any) => {
                    const colors = PLATFORM_COLORS[chat.platform] || { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' }
                    const dateStr = chat.updatedAt ? new Date(chat.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'
                    return (
                      <Link key={chat.id} to={`/chat/${chat.id}`} className="relative flex items-center gap-4 pl-6 group">
                        <div className={`absolute left-[9px] w-3 h-3 rounded-full ${colors.dot} border-2 border-background z-10 group-hover:scale-125 transition-transform`} />
                        <div className="flex-1 rounded-lg border border-border/50 bg-card/50 px-4 py-3 hover:bg-muted/30 hover:border-border transition-all group-hover:translate-x-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{chat.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} font-medium`}>{chat.platformLabel || chat.platform}</span>
                                <span className="text-[10px] text-muted-foreground/60">{dateStr}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                              <MessageSquare className="w-3 h-3" />
                              <span className="text-xs">{chat.messageCount}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
