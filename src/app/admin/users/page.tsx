"use client";

import { useState } from "react";
import { UserSearchTable } from "@/components/admin/users/user-search-table";
import { UserDetailPanel } from "@/components/admin/users/user-detail-panel";

export default function AdminUsersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div>
        <h2 className="font-display text-2xl mb-1">Users</h2>
        <p className="text-text-secondary text-sm">
          Search any account, review its economy and subscription state, and adjust tokens,
          role, or account status.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <UserSearchTable onSelect={setSelectedId} selectedId={selectedId} refreshToken={refreshToken} />

        {selectedId && (
          <UserDetailPanel
            userId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={() => setRefreshToken((t) => t + 1)}
          />
        )}
      </div>
    </div>
  );
}
