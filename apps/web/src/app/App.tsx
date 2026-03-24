import { useEffect, useState } from 'react';
import { NAV_ITEMS } from '@rewind/shared';
import { WizardPage } from '../pages/wizard/WizardPage';
import { RewindPage } from '../pages/rewind/RewindPage';
import { getLibraryItems } from '../lib/browserArchiveStore';

type RouteId = 'rewind' | 'wizard' | 'library';

function getRouteFromHash(): RouteId {
  const hash = typeof window === 'undefined' ? '#/rewind' : window.location?.hash || '#/rewind';
  if (hash.startsWith('#/wizard')) return 'wizard';
  if (hash.startsWith('#/library')) return 'library';
  return 'rewind';
}

function LibraryPage() {
  const libraryItems = getLibraryItems();
  return (
    <section>
      <p className="badge">Library</p>
      <h2>Imported conversations</h2>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Platform</th><th>Account</th><th>Updated</th><th>Messages</th><th>Branches</th></tr>
          </thead>
          <tbody>
            {libraryItems.length === 0 ? <tr><td colSpan={6}>No imported conversations yet.</td></tr> : libraryItems.map((row) => (
              <tr key={row.id}><td>{row.title}</td><td>{row.platform}</td><td>{row.accountLabel}</td><td>{row.updatedAt || 'Unknown'}</td><td>{row.messageCount}</td><td>{row.branchCount}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function App() {
  const [route, setRoute] = useState<RouteId>(getRouteFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return (
    <div className="app-shell">
      <div className="layout-grid">
        <aside className="panel">
          <p className="badge">v1 rewind slice</p>
          <h1>rewind-for-ai-chats</h1>
          <p>Local-first archive with import, library, and the first usable rewind dashboard generated from imported conversations.</p>
          <nav>
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === `#/${route}` || (route === 'rewind' && item.href === '#/rewind');
              return <a key={item.href} className={`nav-link ${isActive ? 'active' : ''}`} href={item.href}>{item.label}</a>;
            })}
          </nav>
        </aside>
        <main className="panel">
          {route === 'wizard' ? <WizardPage /> : route === 'library' ? <LibraryPage /> : <RewindPage />}
        </main>
      </div>
    </div>
  );
}
