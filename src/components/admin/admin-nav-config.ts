import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  Gift,
  Megaphone,
  GalleryHorizontal,
  Activity,
  History,
  KeyRound,
  BarChart3,
  Sparkles,
  Landmark,
  Clapperboard,
  Send,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/**
 * Four clusters, deliberately — not fourteen flat rows and not a group
 * per destination. Fewer, denser sections read as "someone designed the
 * IA" rather than "someone alphabetized a feature list"; each group also
 * stays short enough (2–5 items) to scan without its own scrollbar.
 * AdminSidebar renders these as labeled sections; AdminTopBar's mobile
 * strip still just maps ADMIN_NAV_ITEMS flat and ignores `group`
 * entirely, so nothing there needed to change.
 */
export type AdminNavGroup = "overview" | "content" | "growth" | "platform";

export const ADMIN_NAV_GROUP_LABELS: Record<AdminNavGroup, string> = {
  overview: "Overview",
  content: "Content",
  growth: "Growth",
  platform: "Platform",
};

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: AdminNavGroup;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, group: "overview" },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "overview" },
  { href: "/admin/investor", label: "Investor", icon: TrendingUp, group: "overview" },

  { href: "/admin/characters", label: "Characters", icon: Users, group: "content" },
  { href: "/admin/content-engine", label: "Content Engine", icon: Sparkles, group: "content" },
  { href: "/admin/social", label: "Social", icon: Send, group: "content" },
  { href: "/admin/world", label: "World", icon: Landmark, group: "content" },
  { href: "/admin/scenarios", label: "Scenarios", icon: Clapperboard, group: "content" },

  { href: "/admin/referrals", label: "Referrals", icon: Gift, group: "growth" },
  { href: "/admin/ads", label: "Ads", icon: Megaphone, group: "growth" },
  { href: "/admin/login-portraits", label: "Login Page", icon: GalleryHorizontal, group: "growth" },

  { href: "/admin/safety", label: "Trust & Safety", icon: ShieldAlert, group: "platform" },
  { href: "/admin/ops", label: "Ops", icon: Activity, group: "platform" },
  { href: "/admin/audit", label: "Audit Log", icon: History, group: "platform" },
  { href: "/admin/permissions", label: "Permissions", icon: KeyRound, group: "platform" },
];
