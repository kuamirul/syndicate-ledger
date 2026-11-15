// Unstyled semantic-HTML greybox UI (Milestone 1). Raw tables/buttons/forms only.

import { useReducer, useState } from 'react';
import { CREW_TIERS, STREET_JOBS } from '../data';
import {
  calculateSyndicatePayroll,
  calculateTotalCrewCount,
} from '../engine/crew';
import {
  calculateProjectedRacketYield,
  calculateSyndicateValuation,
  countOwnedRackets,
} from '../engine/reducer';
import type { Action, CrewTierId, GameState, PrepTier } from '../engine/types';
import { DEFAULT_SEED, gameReducer, initUiState } from './gameReducer';
import {
  buildRacketRows,
  buildTraceRows,
  formatPreview,
  PLAYER_ID,
  rollPreview,
  unlockedCrewTiers,
} from './viewModel';

const PREP_LABELS: Record<PrepTier, string> = { 0: 'Prep 0 ($0)', 1: 'Prep 1 ($1,200)', 2: 'Prep 2 ($2,800)' };

function PrepSelect({ value, onChange }: { value: PrepTier; onChange: (v: PrepTier) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) as PrepTier)}>
      {([0, 1, 2] as const).map((t) => (
        <option key={t} value={t}>
          {PREP_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

function Dashboard({ game }: { game: GameState }) {
  const rows = Object.values(game.syndicates);
  return (
    <section>
      <h2>Dashboard — Week {game.week}</h2>
      <table>
        <thead>
          <tr>
            <th>Syndicate</th>
            <th>Dirty $</th>
            <th>Clean $</th>
            <th>Heat</th>
            <th>AP</th>
            <th>Crew (T/E/H)</th>
            <th>Payroll</th>
            <th>Yield/wk</th>
            <th>Rackets</th>
            <th>Valuation</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                {s.name}
                {s.isPlayer ? ' (you)' : s.archetypeId ? ` [${s.archetypeId}]` : ''}
              </td>
              <td>{s.dirtyCash}</td>
              <td>{s.cleanCash}</td>
              <td>{s.heat}</td>
              <td>{s.actionPoints}</td>
              <td>
                {calculateTotalCrewCount(s.crew)} ({s.crew.thug}/{s.crew.enforcer}/{s.crew.hitman})
              </td>
              <td>{calculateSyndicatePayroll(s.crew)}</td>
              <td>{calculateProjectedRacketYield(s.id, game.rackets)}</td>
              <td>{countOwnedRackets(s.id, game.rackets)}</td>
              <td>{calculateSyndicateValuation(s, game.rackets)}</td>
              <td>{s.isEliminated ? `Eliminated (${s.eliminationReason ?? '?'})` : 'Active'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function GreyboxApp() {
  const [ui, dispatch] = useReducer(gameReducer, DEFAULT_SEED, initUiState);
  const { game } = ui;
  const player = game.syndicates[PLAYER_ID]!;

  const [seizePrep, setSeizePrep] = useState<PrepTier>(0);
  const [extortPrep, setExtortPrep] = useState<PrepTier>(0);
  const [jobId, setJobId] = useState<string>(STREET_JOBS[0]?.id ?? '');
  const [crewTier, setCrewTier] = useState<CrewTierId>('thug');
  const [crewCount, setCrewCount] = useState(1);
  const [launder, setLaunder] = useState(1000);
  const [targetId, setTargetId] = useState('');
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED));

  const rivals = Object.values(game.syndicates).filter((s) => s.id !== PLAYER_ID && !s.isEliminated);
  const target = rivals.some((r) => r.id === targetId) ? targetId : (rivals[0]?.id ?? '');
  const act = (action: Action) => dispatch({ type: 'ACTION', action });
  const ownedCount = countOwnedRackets(PLAYER_ID, game.rackets);
  const lastEvents = game.history[game.history.length - 1]?.events ?? [];
  const extortAction: Action = { type: 'EXTORT', jobId, prepTier: extortPrep };
  const over = game.isGameOver;

  return (
    <main>
      <h1>Syndicate Ledger — Greybox</h1>

      {over && (
        <p role="alert">
          <strong>
            Game over — {game.winnerId ? `winner: ${game.syndicates[game.winnerId]?.name}` : 'no winner'}
            {game.winReason ? ` (${game.winReason})` : ''}
          </strong>
        </p>
      )}
      {ui.message && <p role="status">{ui.message}</p>}

      <Dashboard game={game} />

      <section>
        <h2>Actions (AP left: {player.actionPoints})</h2>

        <h3>Extort</h3>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          {STREET_JOBS.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} (def {j.difficultyDef})
            </option>
          ))}
        </select>{' '}
        <PrepSelect value={extortPrep} onChange={setExtortPrep} />{' '}
        <button type="button" disabled={over} onClick={() => act(extortAction)}>
          Extort
        </button>{' '}
        <span>{formatPreview(rollPreview(game, PLAYER_ID, extortAction))}</span>

        <h3>Recruit</h3>
        <select value={crewTier} onChange={(e) => setCrewTier(e.target.value as CrewTierId)}>
          {CREW_TIERS.map((t) => (
            <option key={t.id} value={t.id} disabled={!unlockedCrewTiers(ownedCount).some((u) => u.id === t.id)}>
              {t.name} (${t.hireCost}, needs {t.requiredRackets} rackets)
            </option>
          ))}
        </select>{' '}
        <input
          type="number"
          min={1}
          max={3}
          value={crewCount}
          onChange={(e) => setCrewCount(Number(e.target.value))}
        />{' '}
        <button type="button" disabled={over} onClick={() => act({ type: 'RECRUIT', tier: crewTier, count: crewCount })}>
          Recruit
        </button>

        <h3>Launder</h3>
        <input
          type="number"
          min={1}
          max={10000}
          step={500}
          value={launder}
          onChange={(e) => setLaunder(Number(e.target.value))}
        />{' '}
        <button type="button" disabled={over} onClick={() => act({ type: 'LAUNDER', amount: launder })}>
          Launder
        </button>

        <h3>Bribe / Wiretap / Pass</h3>
        <button type="button" disabled={over} onClick={() => act({ type: 'BRIBE', useClean: true })}>
          Bribe self (clean $3,000)
        </button>{' '}
        <button type="button" disabled={over} onClick={() => act({ type: 'BRIBE', useClean: false })}>
          Bribe self (dirty $4,500)
        </button>
        <br />
        <select value={target} onChange={(e) => setTargetId(e.target.value)}>
          {rivals.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>{' '}
        <button
          type="button"
          disabled={over || !target}
          onClick={() => act({ type: 'BRIBE', useClean: false, targetSyndicateId: target })}
        >
          Frame target (dirty $4,500)
        </button>{' '}
        <button
          type="button"
          disabled={over || !target}
          onClick={() => act({ type: 'WIRETAP', targetSyndicateId: target })}
        >
          Wiretap target ($1,000)
        </button>{' '}
        <button type="button" disabled={over} onClick={() => act({ type: 'PASS' })}>
          Pass
        </button>
      </section>

      <section>
        <h2>Rackets</h2>
        <PrepSelect value={seizePrep} onChange={setSeizePrep} />
        <table>
          <thead>
            <tr>
              <th>Racket</th>
              <th>District</th>
              <th>Owner</th>
              <th>Yield</th>
              <th>Defense</th>
              <th>Passive heat</th>
              <th>Flags</th>
              <th>Seize odds</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buildRacketRows(game).map((r) => {
              const seize: Action = { type: 'SEIZE', racketId: r.id, prepTier: seizePrep };
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.district}</td>
                  <td>{r.ownerName}</td>
                  <td>{r.dirtyYield}</td>
                  <td>{r.defense}</td>
                  <td>{r.passiveHeat}</td>
                  <td>
                    {[r.damaged ? 'damaged' : '', r.monopoly ? 'monopoly' : ''].filter(Boolean).join(', ')}
                  </td>
                  <td>{r.ownerId === PLAYER_ID ? '—' : formatPreview(rollPreview(game, PLAYER_ID, seize))}</td>
                  <td>
                    <button
                      type="button"
                      disabled={over || r.ownerId === PLAYER_ID}
                      onClick={() => act(seize)}
                    >
                      Seize ($1,500 + prep)
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Week control</h2>
        <button type="button" disabled={over} onClick={() => dispatch({ type: 'END_WEEK' })}>
          End Week
        </button>{' '}
        <label>
          Seed{' '}
          <input value={seedInput} onChange={(e) => setSeedInput(e.target.value)} inputMode="numeric" />
        </label>{' '}
        <button
          type="button"
          onClick={() => {
            const n = Number(seedInput);
            dispatch({ type: 'NEW_GAME', seed: Number.isInteger(n) ? n : DEFAULT_SEED });
          }}
        >
          New game
        </button>
        <h3>Last week events</h3>
        {lastEvents.length === 0 ? (
          <p>None.</p>
        ) : (
          <ul>
            {lastEvents.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>AI DecisionTrace (latest 60)</h2>
        <table>
          <thead>
            <tr>
              <th>Wk</th>
              <th>Syndicate</th>
              <th>Action</th>
              <th>Total</th>
              <th>Score breakdown</th>
              <th>Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {buildTraceRows(game.decisionTraces).map((t) => (
              <tr key={t.key}>
                <td>{t.week}</td>
                <td>{t.syndicateId}</td>
                <td>{t.action}</td>
                <td>{t.total}</td>
                <td>{t.breakdown}</td>
                <td>{t.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
