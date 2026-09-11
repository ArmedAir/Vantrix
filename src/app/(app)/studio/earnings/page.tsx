import { redirect } from "next/navigation";

/**
 * EARNINGS-MOVED-TO-SUBSCRIPTION: this page's content (CreatorEarningsDashboard)
 * now lives on /premium as the Creators Dashboard, a Premium-member benefit —
 * see creators-dashboard-section.tsx and studio/page.tsx's own note. This route
 * is kept only so old links/bookmarks land somewhere real instead of a 404.
 */
export default function StudioEarningsRedirect() {
  redirect("/premium#creators-dashboard");
}
