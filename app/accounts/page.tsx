"use client";

import { AccountCard } from "@/components/AccountCard";
import { SpaceRing } from "@/components/SpaceRing";
import { useNebula } from "@/context/NebulaContext";
import { MAX_ACCOUNTS, connectAccount, refreshQuota } from "@/lib/nebula-store";

export default function AccountsPage() {
  const { index, runtime } = useNebula();

  const accounts = [...index.accounts].sort((a, b) => a.priority - b.priority);
  const connected = accounts.filter((a) => runtime[a.email]?.connected);
  const total = connected.reduce((sum, a) => sum + runtime[a.email].total, 0);
  const used = connected.reduce((sum, a) => sum + runtime[a.email].used, 0);

  return (
    <div className="space-y-4">
      <section className="card flex flex-wrap items-center justify-between gap-4">
        <SpaceRing used={used} total={total} />
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary"
            disabled={accounts.length >= MAX_ACCOUNTS}
            onClick={connectAccount}
          >
            Connect Google account
          </button>
          <button className="btn" disabled={connected.length === 0}
            onClick={() => refreshQuota()}>
            Refresh space
          </button>
        </div>
      </section>

      <p className="text-sm text-muted">
        {accounts.length} of {MAX_ACCOUNTS} accounts. Nebula only sees files it
        created. Logins last about an hour and are never saved, so reconnect
        after reopening the tab.
      </p>

      <ul className="space-y-3">
        {accounts.map((account, i) => (
          <AccountCard key={account.email} account={account}
            runtime={runtime[account.email]} position={i} count={accounts.length} />
        ))}
      </ul>
    </div>
  );
}
