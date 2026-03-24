import React, { useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { Activity, Clock, DatabaseZap, MessageSquare, PlayCircle, Share2, Sparkles, Zap } from 'lucide-react'
import { Button } from './components/ui/button'
import { ActivityTrendChart, WordCloudChart } from './components/RewindCharts'
import { RewindStory } from './components/RewindStory'
import { ChatViewer } from './components/ChatViewer'
import { I18nProvider, LanguageSwitcher, useI18n } from './i18n'
import { LibraryPage } from './pages/library/LibraryPage'
import { TimelinePage } from './pages/timeline/TimelinePage'
import { WizardPage } from './pages/wizard/WizardPage.tsx'
import { exportRewindCard } from './lib/exportRewindCard'
import { getRewindAnalytics, listConversationSummaries, prettyPlatformName, subscribeArchive, syncArchiveToLocalApi } from './lib/browserArchiveStore'

function Header() {
  const location = useLocation()
  const { t } = useI18n()
  const isActive = (path: string) => location.pathname === path ? 'text-foreground' : 'text-foreground/60 transition-colors hover:text-foreground/80'

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="container flex h-16 max-w-screen-2xl items-center px-8">
        <div className="mr-4 flex">
          <Link className="mr-6 flex items-center space-x-2" to="/">
            <Zap className="h-6 w-6 text-primary" />
            <span className="font-bold sm:inline-block">{t('app.name')}</span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-medium">
            <Link className={isActive('/')} to="/">{t('nav.dashboard')}</Link>
            <Link className={isActive('/timeline')} to="/timeline">{t('nav.timeline')}</Link>
            <Link className={isActive('/library')} to="/library">{t('nav.library')}</Link>
          </nav>
        </div>
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <LanguageSwitcher />
          <Link to="/import">
            <Button variant="outline">{t('nav.importData')}</Button>
          </Link>
        </div>
      </div>
    </header>
  )
}

function MetricCard({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 flex flex-col justify-between">
      <div className="flex flex-row items-center justify-between space-y-0 pb-2">
        <h3 className="tracking-tight text-sm font-medium">{label}</h3>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function Dashboard() {
  const { t } = useI18n()
  const [showStory, setShowStory] = useState(false)
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all')
  const [archiveVersion, setArchiveVersion] = useState(0)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')

  useEffect(() => subscribeArchive(() => setArchiveVersion((value) => value + 1)), [])

  const analytics = useMemo(() => getRewindAnalytics(selectedYear), [selectedYear, archiveVersion])
  const summaries = useMemo(() => listConversationSummaries(), [archiveVersion])

  useEffect(() => {
    if (selectedYear !== 'all' && !analytics.availableYears.includes(selectedYear)) {
      setSelectedYear(analytics.availableYears[0] ?? 'all')
    }
  }, [analytics.availableYears, selectedYear])

  const yearLabel = selectedYear === 'all' ? t('dashboard.allTime') : String(selectedYear)
  const totals = {
    conversations: Number(analytics?.totals?.conversations || 0),
    messages: Number(analytics?.totals?.messages || 0)
  }
  const platformLabel = analytics.mostUsedPlatform ? prettyPlatformName(analytics.mostUsedPlatform) : '—'
  const topTopicsLabel = analytics.topTopics?.slice(0, 3).map((term: string) => `#${term}`).join(' · ') || '—'

  const handleExportCard = async () => {
    await exportRewindCard({
      yearLabel,
      totals: analytics.totals,
      mostUsedPlatform: platformLabel,
      topTopics: analytics.topTopics,
      mostActiveMonth: analytics.mostActiveMonth,
      labels: {
        appName: t('rewindCard.appName'),
        subtitle: t('rewindCard.subtitle'),
        conversations: t('rewindCard.conversations'),
        messages: t('rewindCard.messages'),
        words: t('rewindCard.words'),
        topPlatform: t('rewindCard.topPlatform'),
        mostActiveMonth: t('rewindCard.mostActiveMonth'),
        topTopics: t('rewindCard.topTopics')
      }
    })
  }

  const handleSync = async () => {
    try {
      setSyncState('syncing')
      await syncArchiveToLocalApi()
      setSyncState('done')
      window.setTimeout(() => setSyncState('idle'), 2400)
    } catch {
      setSyncState('error')
      window.setTimeout(() => setSyncState('idle'), 3000)
    }
  }

  return (
    <main className="flex-1 space-y-4 p-8 pt-6 relative">
      {showStory && <RewindStory onClose={() => setShowStory(false)} stats={analytics} yearLabel={yearLabel} />}

      <div className="flex items-center justify-between space-y-2 mb-6 gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary mb-3">
            <Sparkles className="w-3.5 h-3.5" /> {t('dashboard.rewindEdition', { year: yearLabel })}
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">{t('dashboard.title')}</h2>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-border/60 bg-card/70 px-3 py-3 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('dashboard.rewindFilterLabel')}</span>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value === 'all' ? 'all' : Number(event.target.value))}
              className="min-w-[140px] rounded-xl border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              <option value="all">{t('dashboard.allTime')}</option>
              {analytics.availableYears.map((year: number) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
          <Button
            onClick={() => setShowStory(true)}
            disabled={totals.conversations === 0}
            className="flex gap-2 items-center bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity border-0 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] rounded-xl px-5"
          >
            <PlayCircle className="w-5 h-5" /> {t('dashboard.playRewindFor', { year: yearLabel })}
          </Button>
          <Button variant="outline" className="rounded-xl gap-2" onClick={handleExportCard} disabled={totals.conversations === 0}>
            <Share2 className="w-4 h-4" /> {t('dashboard.shareCard')}
          </Button>
          <Button variant="outline" className="rounded-xl gap-2" onClick={handleSync} disabled={totals.conversations === 0 || syncState === 'syncing'}>
            <DatabaseZap className="w-4 h-4" />
            {syncState === 'syncing' ? t('dashboard.syncing') : syncState === 'done' ? t('dashboard.synced') : syncState === 'error' ? t('dashboard.retrySync') : t('dashboard.syncSqlite')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
        <MetricCard label={t('dashboard.totalConversations')} value={totals.conversations.toLocaleString()} hint={selectedYear === 'all' ? t('dashboard.hintAllArchive') : t('dashboard.hintImportedIn', { year: yearLabel })} icon={MessageSquare} />
        <MetricCard label={t('dashboard.totalMessages')} value={totals.messages.toLocaleString()} hint={t('dashboard.hintNormalizedImports')} icon={Activity} />
        <MetricCard label={t('dashboard.primaryPlatform')} value={platformLabel} hint={analytics.platformShare[0] ? t('dashboard.platformShareHint', { percent: String(Math.round((analytics.platformShare[0].value / Math.max(1, analytics.totals.conversations)) * 100)) }) : t('dashboard.noDominantPlatform')} icon={Zap} />
        <MetricCard label={t('dashboard.topTopicsShort')} value={analytics.topTopics?.[0] ? `#${analytics.topTopics[0]}` : '—'} hint={topTopicsLabel} icon={Clock} />
      </div>

      {totals.conversations > 0 ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3 mt-4">
            <section className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold leading-none tracking-tight">{t('dashboard.momentumComparisonTitle')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{t('dashboard.momentumComparisonSubtitle')}</p>
                </div>
                <span className="text-xs rounded-full border px-3 py-1 text-muted-foreground">{yearLabel}</span>
              </div>
              {selectedYear !== 'all' && analytics.comparison ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-muted/40 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('dashboard.conversationDelta')}</div>
                    <div className="text-2xl font-semibold">{analytics.comparison.conversationsDelta >= 0 ? '+' : ''}{analytics.comparison.conversationsDelta}</div>
                    <div className="text-xs text-muted-foreground">{t('dashboard.vsPreviousYear', { year: String(analytics.comparison.previousYear || t('dashboard.previousYearFallback')) })}</div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('dashboard.messageDelta')}</div>
                    <div className="text-2xl font-semibold">{analytics.comparison.messagesDelta >= 0 ? '+' : ''}{analytics.comparison.messagesDelta}</div>
                    <div className="text-xs text-muted-foreground">More prompts, longer threads, denser sessions.</div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('dashboard.wordDelta')}</div>
                    <div className="text-2xl font-semibold">{analytics.comparison.wordsDelta >= 0 ? '+' : ''}{analytics.comparison.wordsDelta}</div>
                    <div className="text-xs text-muted-foreground">A quick measure of how much thinking you captured.</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">{t('dashboard.switchSpecificYear')}</div>
              )}
            </section>
            <section className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
              <h3 className="font-semibold leading-none tracking-tight mb-4">Metadata health</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Code messages</span><strong>{analytics.modalityCounts?.codeMessages || 0}</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Image messages</span><strong>{analytics.modalityCounts?.imageMessages || 0}</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">File mentions</span><strong>{analytics.modalityCounts?.fileMessages || 0}</strong></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Imported conversations</span><strong>{summaries.length}</strong></div>
              </div>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mt-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-4 p-6 min-h-[400px]">
              <h3 className="font-semibold leading-none tracking-tight mb-4">{t('dashboard.monthlyActivityTrend')}</h3>
              <div className="w-full h-[300px]">
                <ActivityTrendChart selectedYear={selectedYear} />
              </div>
            </div>
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm col-span-3 p-6 min-h-[400px]">
              <h3 className="font-semibold leading-none tracking-tight mb-4">{t('dashboard.topTopics')}</h3>
              <div className="w-full h-[300px] flex items-center justify-center">
                <WordCloudChart selectedYear={selectedYear} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mt-4">
            <section className="rounded-xl border bg-card text-card-foreground shadow-sm p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold leading-none tracking-tight">Longest sessions & standout threads</h3>
                <span className="text-xs text-muted-foreground">Top 5 by message count</span>
              </div>
              <div className="space-y-3">
                {analytics.topConversations?.length ? analytics.topConversations.map((item: any, index: number) => (
                  <Link key={item.conversationId} to={`/chat/${item.conversationId}`} className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground mb-1">#{index + 1} · {prettyPlatformName(item.platform)}</div>
                      <div className="font-medium truncate">{item.title}</div>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="font-semibold">{item.messageCount} msgs</div>
                      <div className="text-xs text-muted-foreground">{item.wordCount} words</div>
                    </div>
                  </Link>
                )) : <div className="text-sm text-muted-foreground">Import a few conversations to see what your most involved sessions looked like.</div>}
              </div>
            </section>
            <section className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
              <h3 className="font-semibold leading-none tracking-tight mb-4">Highlights</h3>
              <div className="space-y-3">
                {analytics.highlights?.length ? analytics.highlights.map((item: any) => (
                  <div key={item.id} className="rounded-xl bg-muted/40 p-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{item.label}</div>
                    <div className="text-sm font-medium leading-relaxed">{item.value}</div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">Your highlights will appear here once you import more data.</div>}
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border bg-card text-card-foreground mt-4 min-h-[400px]">
          <Activity className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-bold mb-2">{t('dashboard.noDataTitle')}</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">{t('dashboard.noDataDesc')}</p>
          <Link to="/import">
            <Button>{t('dashboard.goToImport')}</Button>
          </Link>
        </div>
      )}
    </main>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <div className="min-h-screen bg-background text-foreground dark flex flex-col">
        <Header />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/import" element={<WizardPage />} />
          <Route path="/chat/:chatId" element={<ChatViewer />} />
        </Routes>
      </div>
    </I18nProvider>
  )
}
