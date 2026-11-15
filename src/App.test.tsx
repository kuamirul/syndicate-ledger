import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App Smoke Test', () => {
  it('exports App component as a function', () => {
    expect(typeof App).toBe('function');
  });

  it('renders the greybox dashboard and End Week control', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Dashboard');
    expect(html).toContain('End Week');
    expect(html).toContain('Player Syndicate');
    expect(html).toContain('Clean');
  });
});
