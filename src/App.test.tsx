import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App Smoke Test', () => {
  it('exports App component as a function', () => {
    expect(typeof App).toBe('function');
  });
});
