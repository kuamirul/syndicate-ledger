import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGameStore, type LedgerTab } from '@/store/gameStore';
import { selectIncomingRaidCount } from '@/store/selectors';
import { OperationsTab } from './components/OperationsTab';
import { GlossaryDrawer } from './components/GlossaryDrawer';
import { RivalsTab } from './components/RivalsTab';
import { StatusToast } from './components/StatusToast';
import { TopLedgerBar } from './components/TopLedgerBar';
import { TurfTab } from './components/TurfTab';
import { WeeklyLog } from './components/WeeklyLog';
import { PLAYER_ID } from './viewModel';

export function LedgerShell() {
  const activeTab = useGameStore((s) => s.activeTab);
  const setActiveTab = useGameStore((s) => s.setActiveTab);
  const incoming = useGameStore((s) => selectIncomingRaidCount(s.gameState, PLAYER_ID));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <TopLedgerBar />
        <main className="mx-auto max-w-7xl space-y-3 px-4 py-3">
          <StatusToast />
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as LedgerTab)}>
            <TabsList>
              <TabsTrigger value="ops">[1] Operations</TabsTrigger>
              <TabsTrigger value="turf">
                [2] Businesses &amp; Raids
                {incoming > 0 && <Badge variant="destructive">{incoming}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="rivals">[3] Rivals &amp; Spying</TabsTrigger>
              <TabsTrigger value="ledger">
                [4] Weekly Log <Badge variant="secondary">Replay M4</Badge>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ops">
              <OperationsTab />
            </TabsContent>
            <TabsContent value="turf">
              <TurfTab />
            </TabsContent>
            <TabsContent value="rivals">
              <RivalsTab />
            </TabsContent>
            <TabsContent value="ledger">
              <WeeklyLog />
            </TabsContent>
          </Tabs>
          <GlossaryDrawer />
        </main>
      </div>
    </TooltipProvider>
  );
}
