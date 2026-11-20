// Unstyled semantic-HTML greybox UI (Milestone 1 + M2-T0 plain-English labels and Guided Intro).
// Raw tables/buttons/forms only. Player-facing words come from ./terms; engine ids stay internal.

import { type ReactNode, useReducer, useState } from 'react';
import { CREW_TIERS, STREET_JOBS } from '../data';
import {
  ASSAULT_BASE_COST,
  BRIBE_CLEAN_COST,
  BRIBE_DIRTY_COST,
  LAUNDER_MAX,
  MAX_FRAMES_PER_WEEK,
  MAX_LAUNDERS_PER_WEEK,
  MAX_WEEKS,
  WIRETAP_COST,
  ZERO_CREW_JOB_ID,
} from '../engine/constants';
import { calculateSyndicatePayroll, calculateTotalCrewCount } from '../engine/crew';
import {
  calculateProjectedRacketYield,
  calculateSyndicateValuation,
  countOwnedRackets,
  turfUpkeep,
} from '../engine/reducer';
import type { Action, CrewTierId, GameState, PrepTier } from '../engine/types';
import { DEFAULT_SEED, gameReducer, initUiState } from './gameReducer';
import { guidedPhase, verbLock } from './guidedIntro';
import {
  arrestStrikesLabel,
  GOAL_TEXT,
  OUTCOME_LABELS,
  plainStatusMessage,
  PREP_TERM,
  PREP_TIER_LABELS,
  TERMS,
  VERBS,
  type VerbKey,
} from './terms';
import {
  buildRacketRows,
  buildSiegeRows,
  buildSundayBill,
  buildTraceRows,
  formatPreview,
  PLAYER_ID,
  rollPreview,
  seizeResolveWeek,
  unlockedCrewTiers,
} from './viewModel';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;

function PrepSelect({ value, onChange }: { value: PrepTier; onChange: (v: PrepTier) => void }) {
  return (
    <label title={PREP_TERM.subtitle}>
      {PREP_TERM.label}{' '}
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as PrepTier)}>
        {([0, 1, 2] as const).map((t) => (
          <option key={t} value={t}>
            {PREP_TIER_LABELS[t]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One player verb: heading, subtitle and either its controls or a "Unlocks Week N" badge. */
function VerbBlock({
  verb,
  week,
  guidedIntro,
  children,
}: {
  verb: VerbKey;
  week: number;
  guidedIntro: boolean;
  children: ReactNode;
}) {
  const lock = verbLock(verb, week, guidedIntro);
  return (
    <div data-verb={verb}>
      <h3>
        {VERBS[verb].label}
        {lock.locked && (
          <>
            {' '}
            <strong>{`[${lock.badge ?? ''}]`}</strong>
          </>
        )}
      </h3>
      <p>
        <small>{VERBS[verb].subtitle}</small>
      </p>
      {lock.locked ? (
        <button type="button" disabled>
          {VERBS[verb].label} — {lock.badge}
        </button>
      ) : (
        children
      )}
    </div>
  );
}

function ActiveSieges({ game, showAll }: { game: GameState; showAll: boolean }) {
  const rows = buildSiegeRows(game, PLAYER_ID, showAll);
  return (
    <>
      <p>
        {TERMS.raids.subtitle}
        {showAll ? ' (DEV: showing all)' : ''} Odds are as of now; the attack is rolled when it lands.
      </p>
      {rows.length === 0 ? (
        <p>No visible raids.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Attacker</th>
              <th>Business</th>
              <th>Owner</th>
              <th>Guard payoff</th>
              <th>Staged (week)</th>
              <th>Lands (start of week)</th>
              <th>Attacker odds now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.direction === 'incoming' ? 'INCOMING' : r.direction === 'outgoing' ? 'Yours' : 'Rival'}</td>
                <td>{r.attackerName}</td>
                <td>{r.racketName}</td>
                <td>{r.ownerName}</td>
                <td>{PREP_TIER_LABELS[r.prepTier as PrepTier] ?? r.prepTier}</td>
                <td>{r.telegraphedWeek}</td>
                <td>{r.resolveWeek}</td>
                <td>{r.odds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Dashboard({ game }: { game: GameState }) {
  const rows = Object.values(game.syndicates);
  const bill = buildSundayBill(game, PLAYER_ID);
  return (
    <section>
      <h2>
        Dashboard — Week {game.week} of {MAX_WEEKS}
      </h2>
      {bill && (
        <p>
          Your Sunday bill: Crew Payroll {money(bill.crewPayroll)} + {TERMS.sizeTax.label} {money(bill.turfUpkeep)} (
          {bill.ownedRackets} businesses) = {money(bill.total)}. Business income this Sunday{' '}
          {money(bill.projectedYield)}.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Syndicate</th>
            <th title={TERMS.streetCash.subtitle}>{TERMS.streetCash.label}</th>
            <th title={TERMS.safeCash.subtitle}>{TERMS.safeCash.label}</th>
            <th title={TERMS.heat.subtitle}>{TERMS.heat.label}</th>
            <th>Arrest Strikes</th>
            <th>Actions left</th>
            <th>Crew (Thug/Enforcer/Hitman)</th>
            <th>Crew Payroll</th>
            <th title={TERMS.sizeTax.subtitle}>{TERMS.sizeTax.label}</th>
            <th>Income/wk</th>
            <th>Businesses</th>
            <th title={TERMS.netWorth.subtitle}>{TERMS.netWorth.label}</th>
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
              <td>{money(s.dirtyCash)}</td>
              <td>{money(s.cleanCash)}</td>
              <td>{s.heat}%</td>
              <td>{s.ricoCounter}/2</td>
              <td>{s.actionPoints}</td>
              <td>
                {calculateTotalCrewCount(s.crew)} ({s.crew.thug}/{s.crew.enforcer}/{s.crew.hitman})
              </td>
              <td>{money(calculateSyndicatePayroll(s.crew))}</td>
              <td>{money(turfUpkeep(countOwnedRackets(s.id, game.rackets)))}</td>
              <td>{money(calculateProjectedRacketYield(s.id, game.rackets))}</td>
              <td>{countOwnedRackets(s.id, game.rackets)}</td>
              <td>{money(calculateSyndicateValuation(s, game.rackets))}</td>
              <td>{s.isEliminated ? `Out: ${OUTCOME_LABELS[s.eliminationReason ?? ''] ?? '?'}` : 'Active'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>What do these words mean?</summary>
        <dl>
          {Object.values(TERMS).map((t) => (
            <div key={t.label}>
              <dt>{t.label}</dt>
              <dd>{t.subtitle}</dd>
            </div>
          ))}
          <dt>{arrestStrikesLabel(0).replace('0/2', 'X/2')}</dt>
          <dd>Ending a week at 100% Heat is a strike; two weeks in a row and you are out.</dd>
        </dl>
      </details>
    </section>
  );
}

export function GreyboxApp() {
  const [ui, dispatch] = useReducer(gameReducer, DEFAULT_SEED, initUiState);
  const { game, guidedIntro } = ui;
  const player = game.syndicates[PLAYER_ID]!;

  const [seizePrep, setSeizePrep] = useState<PrepTier>(0);
  const [extortPrep, setExtortPrep] = useState<PrepTier>(0);
  const [jobId, setJobId] = useState<string>(STREET_JOBS[0]?.id ?? '');
  const [crewTier, setCrewTier] = useState<CrewTierId>('thug');
  const [crewCount, setCrewCount] = useState(1);
  const [launder, setLaunder] = useState(1000);
  const [targetId, setTargetId] = useState('');
  const [seedInput, setSeedInput] = useState(String(DEFAULT_SEED));
  const [devShowAllSieges, setDevShowAllSieges] = useState(false);

  const rivals = Object.values(game.syndicates).filter((s) => s.id !== PLAYER_ID && !s.isEliminated);
  const target = rivals.some((r) => r.id === targetId) ? targetId : (rivals[0]?.id ?? '');
  const act = (action: Action) => dispatch({ type: 'ACTION', action });
  const ownedCount = countOwnedRackets(PLAYER_ID, game.rackets);
  const hasCrew = calculateTotalCrewCount(player.crew) > 0;
  const lastEvents = game.history[game.history.length - 1]?.events ?? [];
  const extortAction: Action = { type: 'EXTORT', jobId, prepTier: extortPrep };
  const over = game.isGameOver;
  const week = game.week;
  const phase = guidedPhase(week);
  const verbProps = { week, guidedIntro };
  const raidLock = verbLock('stageRaid', week, guidedIntro);
  const launderedThisWeek = player.laundersThisWeek >= MAX_LAUNDERS_PER_WEEK;
  const snitchedThisWeek = player.framesThisWeek >= MAX_FRAMES_PER_WEEK;

  return (
    <main>
      <header>
        <h1>Syndicate Ledger — Greybox</h1>
        <p>
          <strong>{GOAL_TEXT}</strong>
        </p>
        <label>
          <input
            type="checkbox"
            checked={guidedIntro}
            onChange={(e) => dispatch({ type: 'SET_GUIDED_INTRO', on: e.target.checked })}
          />{' '}
          {`[Guided Intro: ${guidedIntro ? 'ON' : 'OFF'}]`}
        </label>
        {guidedIntro && !over && (
          <p role="note" data-phase={phase.phase}>
            <strong>{phase.title}</strong> — {phase.banner}
          </p>
        )}
      </header>

      {over && (
        <p role="alert">
          <strong>
            Game over — {game.winnerId ? `winner: ${game.syndicates[game.winnerId]?.name}` : 'no winner'}
            {game.winReason ? ` (${OUTCOME_LABELS[game.winReason] ?? game.winReason})` : ''}
          </strong>
        </p>
      )}
      {ui.message && <p role="status">{plainStatusMessage(ui.message)}</p>}

      <Dashboard game={game} />

      <section>
        <h2>Actions (actions left this week: {player.actionPoints})</h2>
        <p>
          {arrestStrikesLabel(player.ricoCounter)} · {TERMS.heat.label}: {player.heat}%
        </p>

        <VerbBlock verb="runJob" {...verbProps}>
          <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {STREET_JOBS.map((j) => (
              <option key={j.id} value={j.id} disabled={!hasCrew && j.id !== ZERO_CREW_JOB_ID}>
                {j.name} (difficulty {j.difficultyDef}, pays up to {money(j.cleanPayout)})
                {!hasCrew && j.id !== ZERO_CREW_JOB_ID ? ' — needs crew' : ''}
              </option>
            ))}
          </select>{' '}
          <PrepSelect value={extortPrep} onChange={setExtortPrep} />{' '}
          <button type="button" disabled={over} onClick={() => act(extortAction)}>
            {VERBS.runJob.label}
          </button>{' '}
          <span>{formatPreview(rollPreview(game, PLAYER_ID, extortAction))}</span>
          {!hasCrew && <p>No crew: only the Corner Shakedown is possible until you hire crew.</p>}
        </VerbBlock>

        <VerbBlock verb="claimBusiness" {...verbProps}>
          <p>Pick an empty (Neutral) business in the Businesses table below — {money(ASSAULT_BASE_COST)} + guard payoff.</p>
        </VerbBlock>

        <VerbBlock verb="hireCrew" {...verbProps}>
          <select value={crewTier} onChange={(e) => setCrewTier(e.target.value as CrewTierId)}>
            {CREW_TIERS.map((t) => (
              <option key={t.id} value={t.id} disabled={!unlockedCrewTiers(ownedCount).some((u) => u.id === t.id)}>
                {t.name} ({money(t.hireCost)}, needs {t.requiredRackets} businesses)
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
          <button
            type="button"
            disabled={over}
            onClick={() => act({ type: 'RECRUIT', tier: crewTier, count: crewCount })}
          >
            {VERBS.hireCrew.label}
          </button>
        </VerbBlock>

        <VerbBlock verb="bankCash" {...verbProps}>
          <input
            type="number"
            min={1}
            max={LAUNDER_MAX}
            step={500}
            value={launder}
            onChange={(e) => setLaunder(Number(e.target.value))}
          />{' '}
          <button
            type="button"
            disabled={over || launderedThisWeek}
            onClick={() => act({ type: 'LAUNDER', amount: launder })}
          >
            {launderedThisWeek ? 'Already banked this week' : `Bank (25% fee, max ${money(LAUNDER_MAX)})`}
          </button>
        </VerbBlock>

        <VerbBlock verb="payCops" {...verbProps}>
          <button type="button" disabled={over} onClick={() => act({ type: 'BRIBE', useClean: true })}>
            Pay with {TERMS.safeCash.label} ({money(BRIBE_CLEAN_COST)})
          </button>{' '}
          <button type="button" disabled={over} onClick={() => act({ type: 'BRIBE', useClean: false })}>
            Pay with {TERMS.streetCash.label} ({money(BRIBE_DIRTY_COST)})
          </button>
        </VerbBlock>

        <p>
          <label>
            Rival{' '}
            <select value={target} onChange={(e) => setTargetId(e.target.value)}>
              {rivals.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </p>

        <VerbBlock verb="spy" {...verbProps}>
          <button
            type="button"
            disabled={over || !target}
            onClick={() => act({ type: 'WIRETAP', targetSyndicateId: target })}
          >
            {VERBS.spy.label} ({money(WIRETAP_COST)})
          </button>
        </VerbBlock>

        <VerbBlock verb="snitch" {...verbProps}>
          <button
            type="button"
            disabled={over || !target || snitchedThisWeek}
            onClick={() => act({ type: 'BRIBE', useClean: false, targetSyndicateId: target })}
          >
            {snitchedThisWeek ? 'Already snitched this week' : `${VERBS.snitch.label} (${money(BRIBE_DIRTY_COST)} street cash)`}
          </button>
        </VerbBlock>

        <VerbBlock verb="stageRaid" {...verbProps}>
          <p>Pick a rival-owned business in the Businesses table below — {money(ASSAULT_BASE_COST)} + guard payoff.</p>
        </VerbBlock>

        <h3>Skip</h3>
        <button type="button" disabled={over} onClick={() => act({ type: 'PASS' })}>
          Skip one action
        </button>
      </section>

      <section>
        <h2>Businesses</h2>
        <PrepSelect value={seizePrep} onChange={setSeizePrep} />
        {!hasCrew && <p>No crew: hire crew before claiming or raiding a business.</p>}
        <table>
          <thead>
            <tr>
              <th>Business</th>
              <th>District</th>
              <th>Owner</th>
              <th>Income/wk</th>
              <th>Defense</th>
              <th>Heat/wk</th>
              <th>Flags</th>
              <th>Your odds</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buildRacketRows(game).map((r) => {
              const seize: Action = { type: 'SEIZE', racketId: r.id, prepTier: seizePrep };
              const isRaid = r.ownerId !== null && r.ownerId !== PLAYER_ID;
              const alreadyRaiding = game.activeSieges.some(
                (sg) => sg.attackerId === PLAYER_ID && sg.racketId === r.id
              );
              const locked = isRaid && raidLock.locked;
              let label: string;
              if (r.ownerId === PLAYER_ID) label = 'Yours';
              else if (!isRaid) label = `${VERBS.claimBusiness.label} (${money(ASSAULT_BASE_COST)} + payoff)`;
              else if (locked) label = `${VERBS.stageRaid.label} — ${raidLock.badge ?? ''}`;
              else if (alreadyRaiding) label = 'Raid underway';
              else label = `${VERBS.stageRaid.label} (lands wk ${seizeResolveWeek(game, r.id)})`;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.district}</td>
                  <td>{r.ownerName}</td>
                  <td>{money(r.dirtyYield)}</td>
                  <td>{r.defense}</td>
                  <td>+{r.passiveHeat}</td>
                  <td>
                    {[r.damaged ? 'damaged' : '', r.monopoly ? 'whole district (+25%)' : ''].filter(Boolean).join(', ')}
                  </td>
                  <td>{r.ownerId === PLAYER_ID ? '—' : formatPreview(rollPreview(game, PLAYER_ID, seize))}</td>
                  <td>
                    <button
                      type="button"
                      title={isRaid ? VERBS.stageRaid.subtitle : VERBS.claimBusiness.subtitle}
                      disabled={over || r.ownerId === PLAYER_ID || alreadyRaiding || locked || !hasCrew}
                      onClick={() => act(seize)}
                    >
                      {label}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>[Active Sieges] {TERMS.raids.label}</h2>
        <label>
          <input
            type="checkbox"
            checked={devShowAllSieges}
            onChange={(e) => setDevShowAllSieges(e.target.checked)}
          />{' '}
          [DEV] show all raids
        </label>
        <ActiveSieges game={game} showAll={devShowAllSieges} />
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
        <h2>AI DecisionTrace (debug, latest 60)</h2>
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
