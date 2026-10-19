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
import { AppPage, Panel } from "@/components/site/AppPage";
import { Stat, StatRow } from "@/components/site/Stat";

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
      art="/art/crew.svg"
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
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[300px_1fr] lg:grid-rows-[minmax(0,1fr)]">
        <aside aria-label="Overview" className="flex flex-col gap-5 lg:min-h-0 lg:overflow-hidden">
          <div className="card">
            <SpaceRing used={used} total={total} compact />
          </div>
          <StatRow compact>
            <Stat value={`${accounts.length}/${MAX_ACCOUNTS}`} label="in the pool" />
            <Stat value={connected.length} label="connected" />
            <Stat value={index.settings.routing === "priority" ? "Order" : "Even"} label="placement" />
            <Stat value={index.settings.safeMode ? "On" : "Off"} label="safe mode" />
          </StatRow>
        </aside>

        <Panel
          label="Your accounts"
          title={
            <div>
              <h2 className="font-sans text-xl font-semibold">Accounts · {accounts.length} of {MAX_ACCOUNTS}</h2>
              {accounts.length > 1 && (
                <p className="font-sans text-sm font-light text-muted">Drag to reorder: the top account fills first.</p>
              )}
            </div>
          }
          aside={
            accounts.length > 0 && accounts.length < MAX_ACCOUNTS ? (
              <button className="btn btn-primary" onClick={connectAccount}>Add account</button>
            ) : undefined
          }
        >
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
              <img src="/art/crew.svg" alt="" className="h-36 w-auto" />
              <p className="card-title">No accounts yet</p>
              <p className="max-w-md font-sans text-base font-light text-muted">
                Connect your first Google account to start pooling its free space.
              </p>
              <button className="l-btn l-btn-lime mt-2" onClick={connectAccount}>Connect Google account</button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
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
        </Panel>
      </div>
    </AppPage>
  );
}
