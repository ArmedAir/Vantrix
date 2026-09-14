import { getInvestorSnapshot } from "@/lib/admin/investor";
import { InvestorDashboard } from "@/components/admin/investor/investor-dashboard";

const VALID_RANGES = [7, 30, 90];

function parseDays(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return VALID_RANGES.includes(n) ? n : 30;
}

export default async function AdminInvestorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const days = parseDays(params.days);

  const snapshot = await getInvestorSnapshot(days);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      <div>
        <h2 className="font-display text-2xl mb-1">Investor</h2>
        <p className="text-text-secondary text-sm">
          Aggregate-only board view — growth, revenue, and platform-health counts. No user-identifying detail.
        </p>
      </div>

      <InvestorDashboard snapshot={snapshot} days={days} />
    </div>
  );
}
