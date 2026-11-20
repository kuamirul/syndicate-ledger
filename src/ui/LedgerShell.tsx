import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGameStore, type LedgerTab } from '@/store/gameStore';
import { selectIncomingRaidCount } from '@/store/selectors';
import { GlossaryDrawer } from './components/GlossaryDrawer';
import { StatusToast } from './components/StatusToast';
import { TopLedgerBar } from './components/TopLedgerBar';
import { WeeklyLog } from './components/WeeklyLog';
import { PLAYER_ID } from './viewModel';

function Placeholder({ title, body, scope }: { title: string; body: string; scope: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="outline">Coming in {scope}</Badge>
      </CardContent>
    </Card>
  );
}

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
              <Placeholder title="Operations" body="Run cash jobs, hire crew, bank safe cash and pay off cops." scope="M2-T2" />
            </TabsContent>
            <TabsContent value="turf">
              <Placeholder title="Businesses & Raids" body="Claim empty businesses and stage or defend against raids." scope="M2-T2" />
            </TabsContent>
            <TabsContent value="rivals">
              <Placeholder title="Rivals & Spying" body="Spy on rivals and snitch to the police." scope="M2-T3" />
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
