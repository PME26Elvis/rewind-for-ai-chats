import { useMemo, useState } from 'react';
import { getRewindAnalytics } from '../../lib/browserArchiveStore';

const PLATFORM_COLORS: Record<string, string[]> = {
  chatgpt: ['#fca5a5', '#ef4444', '#b91c1c'],
  gemini: ['#93c5fd', '#3b82f6', '#1d4ed8'],
  grok: ['#86efac', '#22c55e', '#15803d'],
  claude: ['#fde68a', '#f59e0b', '#b45309']
};

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

function StatCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  return <div className="card"><p className="muted-label">{label}</p><strong className="hero-metric">{value}</strong>{subtext ? <p className="muted-copy">{subtext}</p> : null}</div>;
}

function SimpleBarChart({ title, data, color }: { title: string; data: Array<{ label: string; value: number }>; color: string }) {
  const maxValue = Math.max(1, ...data.map((entry) => entry.value));
  return <div className="card"><h3>{title}</h3><div className="chart-bars">{data.map((entry) => <div key={entry.label} className="chart-bar-group"><div className="chart-bar-track"><div className="chart-bar-fill" style={{ height: `${(entry.value / maxValue) * 100}%`, background: color }} /></div><span className="chart-value">{entry.value}</span><span className="chart-label">{entry.label}</span></div>)}</div></div>;
}

function ShareChart({ title, data }: { title: string; data: Array<{ label: string; value: number; platform?: string; shadeIndex?: number }> }) {
  const total = data.reduce((sum, entry) => sum + entry.value, 0) || 1;
  return <div className="card"><h3>{title}</h3><div className="share-stack">{data.length === 0 ? <p className="muted-copy">No imported data yet.</p> : data.map((entry) => {
    const palette = PLATFORM_COLORS[entry.platform || 'chatgpt'] || ['#94a3b8'];
    const color = palette[Math.min(entry.shadeIndex || 0, palette.length - 1)];
    return <div key={entry.label} className="share-row"><div className="share-swatch" style={{ background: color, width: `${(entry.value / total) * 100}%` }} /><div className="share-meta"><span>{entry.label}</span><strong>{entry.value}</strong></div></div>;
  })}</div></div>;
}

function WordCloud({ words }: { words: Array<{ term: string; count: number; weight: number }> }) {
  return <div className="card"><h3>Word cloud</h3><div className="word-cloud">{words.length === 0 ? <p className="muted-copy">Import conversations to generate a local word cloud.</p> : words.map((word) => <span key={word.term} className="word-chip" style={{ fontSize: `${0.85 + word.weight * 1.5}rem` }}>{word.term} <small>{word.count}</small></span>)}</div></div>;
}

function Highlights({ items }: { items: Array<{ id: string; label: string; value: string }> }) {
  if (items.length === 0) return null;
  return <div className="card"><h3>Highlights</h3><div className="highlight-grid">{items.map((item) => <article key={item.id} className="highlight-card"><p className="muted-label">{item.label}</p><strong>{item.value}</strong></article>)}</div></div>;
}

export function RewindPage() {
  const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');
  const analytics = useMemo(() => getRewindAnalytics(selectedYear), [selectedYear]);

  return (
    <section>
      <div className="section-header">
        <div>
          <p className="badge">Rewind / Analytics</p>
          <h2>Rewind dashboard</h2>
          <p>Yearly and all-time analytics generated locally from imported archive data.</p>
        </div>
        <label className="year-filter">
          <span>View</span>
          <select aria-label="Year selector" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value === 'all' ? 'all' : Number(event.target.value))}>
            <option value="all">All time</option>
            {analytics.availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>

      {analytics.totals.conversations === 0 ? <div className="card"><h3>No rewind data yet</h3><p className="muted-copy">Import JSON or HTML conversations in the Wizard to populate the dashboard.</p></div> : <>
        <div className="metric-grid">
          <StatCard label="Total conversations" value={analytics.totals.conversations} />
          <StatCard label="Total messages" value={analytics.totals.messages} />
          <StatCard label="Total words" value={analytics.totals.words} />
          <StatCard label="Active months" value={analytics.totals.activeMonths} />
          <StatCard label="Avg. messages / conversation" value={analytics.totals.averageMessagesPerConversation} />
          <StatCard label="Most active month" value={analytics.mostActiveMonth || '—'} />
          <StatCard label="Most used platform" value={analytics.mostUsedPlatform || '—'} />
          <StatCard label="Branch-heavy ratio" value={formatRatio(analytics.totals.branchHeavyRatio)} />
        </div>

        <div className="dashboard-grid" style={{ marginTop: 24 }}>
          <SimpleBarChart title="Monthly message count" data={analytics.monthlyMessageCount} color="#f87171" />
          <SimpleBarChart title="Monthly conversation count" data={analytics.monthlyConversationCount} color="#60a5fa" />
          <ShareChart title="Platform share" data={analytics.platformShare} />
          <ShareChart title="Account share" data={analytics.accountShare} />
          <SimpleBarChart title="Branch count distribution" data={analytics.branchCountDistribution} color="#34d399" />
          <WordCloud words={analytics.wordCloud} />
        </div>

        <Highlights items={analytics.highlights} />
      </>}
    </section>
  );
}
