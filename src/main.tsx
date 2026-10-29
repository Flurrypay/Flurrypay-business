import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import DesignScreen from './DesignScreen';
import screens from './screens.json';
import './styles.css';
import './interactions.css';
import { DraftProvider } from './InteractionRuntime';

function App() {
  const [path, setPath] = useState(location.pathname.replace(/\/$/, '') || '/');
  useEffect(() => {
    const update = () => setPath(location.pathname.replace(/\/$/, '') || '/');
    addEventListener('popstate', update);
    return () => removeEventListener('popstate', update);
  }, []);
  function navigate(next: string) {
    if (next === path) return;
    history.pushState(null, '', next); setPath(next); window.scrollTo(0, 0);
  }
  const aliases: Record<string, string> = { '/products/multi-currency-accounts': '/products/digital-wallet-services-flurrypay' };
  const screen = screens.find(s => s.route === (aliases[path] || path));
  if (path === '/designs') return <main className="design-index"><h1>FlurryPay design screens</h1><p>Local design review index · {screens.length} source screens</p>{['website', 'merchant', 'admin'].map(category => <section key={category}><h2>{category}</h2><ul>{screens.filter(s => s.category === category).map(s => <li key={s.id}><a href={s.route} onClick={e => { e.preventDefault(); navigate(s.route); }}>{s.name}</a><small>{s.id}</small></li>)}</ul></section>)}</main>;
  if (!screen) return <main className="design-index"><h1>Page not found</h1><a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>Return home</a></main>;
  return <DesignScreen screen={screen} navigate={navigate} />;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><DraftProvider><App /></DraftProvider></React.StrictMode>);
