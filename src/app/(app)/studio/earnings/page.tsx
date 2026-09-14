import { redirect } from "next/navigation";

/**
 * EARNINGS-MOVED-TO-ANALYTICS: this page's content (CreatorEarningsDashboard)
 * now lives at the standalone /analytics page — see (app)/analytics/page.tsx.
 * This route is kept only so old links/bookmarks land somewhere real
 * instead of a 404.
 */
export default function StudioEarningsRedirect() {
  redirect("/analytics");
}
