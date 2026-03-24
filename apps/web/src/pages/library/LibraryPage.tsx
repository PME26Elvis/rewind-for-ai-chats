import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, FileImage, FileSearch, Search, Star, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { getAvailablePlatforms, getLibraryItems, prettyPlatformName, removeConversations, subscribeArchive, toggleConversationFavorite } from '../../lib/browserArchiveStore'
import { useI18n } from '../../i18n'

function platformBadgeClass(platform: string) {
  if (platform === 'chatgpt') return 'bg-red-500/10 text-red-400'
  if (platform === 'gemini') return 'bg-blue-500/10 text-blue-400'
  if (platform === 'claude') return 'bg-yellow-500/10 text-yellow-500'
  return 'bg-green-500/10 text-green-400'
}

export function LibraryPage() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [platform, setPlatform] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [attachmentsOnly, setAttachmentsOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'most_msgs' | 'az' | 'za'>('newest')
  const [archiveVersion, setArchiveVersion] = useState(0)

  useEffect(() => subscribeArchive(() => setArchiveVersion((value) => value + 1)), [])

  const availablePlatforms = useMemo(() => getAvailablePlatforms(), [archiveVersion])
  const items = useMemo(() => {
    const filtered = getLibraryItems({ query, platform, favoriteOnly, withAttachmentsOnly: attachmentsOnly })
    return [...filtered].sort((left: any, right: any) => {
      switch (sortBy) {
        case 'newest': return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))
        case 'oldest': return String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''))
        case 'most_msgs': return (right.messageCount || 0) - (left.messageCount || 0)
        case 'az': return left.title.localeCompare(right.title)
        case 'za': return right.title.localeCompare(left.title)
      }
    })
  }, [query, platform, favoriteOnly, attachmentsOnly, sortBy, archiveVersion])

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map((item: any) => item.id)))
  }

  const handleDelete = () => {
    removeConversations([...selectedIds])
    setSelectedIds(new Set())
  }

  const toggleFavorite = (id: string) => {
    toggleConversationFavorite(id)
    setArchiveVersion((value) => value + 1)
  }

  return (
    <main className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('library.title')}</h2>
          <p className="text-muted-foreground mt-2">{t('library.archived', { count: items.length })}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant={favoriteOnly ? 'default' : 'outline'} onClick={() => setFavoriteOnly((value) => !value)}>Favorites</Button>
          <Button variant={attachmentsOnly ? 'default' : 'outline'} onClick={() => setAttachmentsOnly((value) => !value)}>Attachments</Button>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px] relative">
          <Search className="absolute left-4 top-3.5 h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-11 pr-4 py-3 text-sm"
            placeholder="Search titles, previews, and imported text…"
          />
        </div>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <option value="all">{t('library.allPlatforms')}</option>
          {availablePlatforms.map((item: string) => <option key={item} value={item}>{prettyPlatformName(item)}</option>)}
        </select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as any)} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <option value="newest">{t('library.sortNewest')}</option>
          <option value="oldest">{t('library.sortOldest')}</option>
          <option value="most_msgs">{t('library.sortMostMsgs')}</option>
          <option value="az">{t('library.sortAZ')}</option>
          <option value="za">{t('library.sortZA')}</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
        <div className="border-b border-border/60 bg-muted/10 px-4 py-3 flex items-center justify-between text-sm">
          <div>{selectedIds.size > 0 ? `${selectedIds.size} selected` : `${items.length} results`}</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>{selectedIds.size === items.length && items.length > 0 ? 'Clear' : 'Select all'}</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={selectedIds.size === 0}><Trash2 className="w-4 h-4 mr-2" /> Remove</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/10 text-muted-foreground">
                <th className="p-3 text-left"><input type="checkbox" checked={items.length > 0 && selectedIds.size === items.length} onChange={toggleSelectAll} /></th>
                <th className="p-3 text-left">{t('library.colFavorite')}</th>
                <th className="p-3 text-left">{t('library.colTitle')}</th>
                <th className="p-3 text-left">{t('library.colPlatform')}</th>
                <th className="p-3 text-left">Preview</th>
                <th className="p-3 text-left">Metadata</th>
                <th className="p-3 text-right">{t('library.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <FileSearch className="w-10 h-10 opacity-50" />
                      <div>{query ? t('library.noMatch') : t('library.noConversationsYet')}</div>
                    </div>
                  </td>
                </tr>
              ) : items.map((chat: any) => (
                <tr key={chat.id} className="border-b border-border/40 hover:bg-muted/10 align-top">
                  <td className="p-3"><input type="checkbox" checked={selectedIds.has(chat.id)} onChange={() => toggleSelect(chat.id)} /></td>
                  <td className="p-3">
                    <button onClick={() => toggleFavorite(chat.id)} className="text-muted-foreground hover:text-yellow-400 transition-colors">
                      <Star className={`h-4 w-4 ${chat.favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </button>
                  </td>
                  <td className="p-3 min-w-[220px]">
                    <Link to={`/chat/${chat.id}`} className="font-medium hover:text-primary transition-colors block">{chat.title}</Link>
                    <div className="text-xs text-muted-foreground mt-1">{chat.updatedAt ? String(chat.updatedAt).slice(0, 10) : 'Unknown date'} · {chat.messageCount} msgs · {chat.branchCount} branches</div>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${platformBadgeClass(chat.platform)}`}>{chat.platformLabel}</span>
                  </td>
                  <td className="p-3 max-w-[360px]">
                    <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{chat.preview || 'No preview yet.'}</p>
                    {chat.topTerms?.length ? <div className="mt-2 flex flex-wrap gap-2">{chat.topTerms.slice(0, 4).map((term: string) => <span key={term} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">#{term}</span>)}</div> : null}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {chat.hasImages ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1"><FileImage className="w-3 h-3" /> images</span> : null}
                      {chat.hasFiles ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">files</span> : null}
                      {chat.hasCode ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1">code</span> : null}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <Link to={`/chat/${chat.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
