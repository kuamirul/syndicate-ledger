import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { PREP_TERM, TERMS, VERBS } from '../terms';

export function GlossaryDrawer() {
  const [open, setOpen] = useState(false);
  const entries = [...Object.values(TERMS), ...Object.values(VERBS), PREP_TERM];
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Quick Glossary
        <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <dl className="grid gap-x-6 gap-y-1 border-t border-zinc-800 p-3 text-xs md:grid-cols-2">
          {entries.map((e) => (
            <div key={e.label}>
              <dt className="font-semibold text-zinc-200">{e.label}</dt>
              <dd className="text-zinc-400">{e.subtitle}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
