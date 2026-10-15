"use client";

import { AccountCard } from "@/components/AccountCard";
import { SpaceRing } from "@/components/SpaceRing";
import { useNebula } from "@/context/NebulaContext";
import {
  MAX_ACCOUNTS,
  connectAccount,
  refreshQuota,
  reorderAccounts,
} from "@/lib/nebula-store";
import { AppPage } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";
import { Glyph } from "@/components/landing/parts";

export default function AccountsPage() {
  const { index, runtime } = useNebula();

  const accounts = [...index.accounts].sort((a, b) => a.priority - b.priority);
  const connected = accounts.filter((a) => runtime[a.email]?.connected);
  const total = connected.reduce((sum, a) => sum + runtime[a.email].total, 0);
  const used = connected.reduce((sum, a) => sum + runtime[a.email].used, 0);

  return (
    <AppPage
      tag="Accounts"
      title="Your accounts"
      lead="Connect up to five Google accounts. Their free space adds up into one pool."
      actions={
        <>
          <button className="l-btn l-btn-lime" disabled={accounts.length >= MAX_ACCOUNTS} onClick={connectAccount}>
            Connect Google account
          </button>
          <button className="l-btn l-btn-plain" disabled={connected.length === 0} onClick={() => refreshQuota()}>
            Refresh space
          </button>
        </>
      }
    >
      <section data-reveal aria-label="Overview" className="grid gap-6 lg:grid-cols-[1.1fr_2fr]">
        <div className="card card-lift flex items-center">
          <SpaceRing used={used} total={total} />
        </div>
        <StatRow>
          <Stat value={`${accounts.length}/${MAX_ACCOUNTS}`} label="accounts" note="in the pool" />
          <Stat value={connected.length} label="connected" note="this session" />
          <Stat value={index.settings.routing === "priority" ? "Order" : "Even"} label="placement" note="change in Settings" />
          <Stat value={index.settings.safeMode ? "On" : "Off"} label="safe mode" note="second copies" />
        </StatRow>
      </section>

      <div data-reveal className="card flex gap-4 bg-paper">
        <span className="mt-1 text-muted"><Glyph name="sparkle" /></span>
        <p className="font-sans text-base font-light">
          New files go to the account with the highest priority first: drag the
          cards or use the arrows to reorder. Nebula only sees files it created.
          Logins last about an hour and are never saved, so you reconnect with
          one click after reopening the tab.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div data-reveal className="card flex flex-col items-center gap-4 py-12 text-center">
          <p className="card-title">No accounts yet</p>
          <p className="max-w-md font-sans text-lg font-light text-muted">
            Connect your first Google account to start pooling its free space.
          </p>
          <button className="l-btn l-btn-lime" onClick={connectAccount}>Connect Google account</button>
        </div>
      ) : (
        <ul className="grid gap-6 lg:grid-cols-2">
          {accounts.map((account, i) => (
            <AccountCard key={account.email} account={account}
              runtime={runtime[account.email]} position={i} count={accounts.length}
              onReorder={(dragged, target) => {
                const order = accounts.map((a) => a.email).filter((e) => e !== dragged);

                order.splice(order.indexOf(target) + (i > accounts.findIndex((a) => a.email === dragged) ? 1 : 0), 0, dragged);
                reorderAccounts(order);
              }} />
          ))}
        </ul>
      )}
    </AppPage>
  );
}
