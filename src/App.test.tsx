import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { GreyboxApp } from './ui/GreyboxApp';
import { isGreyboxRequested } from './ui/route';

describe('App Smoke Test', () => {
  it('exports App component as a function', () => {
    expect(typeof App).toBe('function');
  });

  it('renders the Operations tab sections with Guided Intro locks on week 1', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Run Cash Job');
    expect(html).toContain('Boost Odds');
    expect(html).toContain('Hire Crew');
    expect(html).toContain('Unlocks Week 3');
    expect(html).toContain('Unlocks Week 4');
    expect(html).toContain('Cost $800 → Leaves $5,200 Street Cash');
    expect(html).toContain('Needs ≥2 Businesses');
  });

  it('renders the Zinc ledger shell by default and detects ?greybox=1', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Your Wallet');
    expect(html).toContain('Street Cash');
    expect(html).toContain('End Week');
    expect(html).toContain('[4] Weekly Log');
    expect(html).toContain('Greybox View');
    expect(isGreyboxRequested('?greybox=1')).toBe(true);
    expect(isGreyboxRequested('')).toBe(false);
    expect(isGreyboxRequested('?greybox=0')).toBe(false);
  });

  it('renders the greybox dashboard and End Week control', () => {
    const html = renderToString(<GreyboxApp />);
    expect(html).toContain('Dashboard');
    expect(html).toContain('End Week');
    expect(html).toContain('Player Syndicate');
    expect(html).toContain('Clean');
    expect(html).toContain('[Active Sieges]');
    expect(html).toContain('Turf Upkeep');
  });

  it('shows the goal, the Guided Intro toggle and Phase 1 locks on week 1', () => {
    const html = renderToString(<GreyboxApp />);
    expect(html).toContain('Goal: Highest Net Worth after Week 28');
    expect(html).toContain('[Guided Intro: ON]');
    expect(html).toContain('Phase 1: Build Your Base');
    expect(html).toContain('Run Cash Job');
    expect(html).toContain('Claim Empty Business');
    expect(html).toContain('Hire Crew');
    expect(html).toContain('[Unlocks Week 3]');
    expect(html).toContain('[Unlocks Week 4]');
    expect(html).not.toMatch(/>(Extort|Launder|Wiretap target|Frame target)/);
  });
});
