import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Shared Vantrix brand mark.
 *
 * LOGO FIX: PublicHeader, Sidebar, and MobileDrawer each hand-rolled the
 * same placeholder — a plain gold `<span>` tile with a hardcoded "V"
 * character — instead of the platform's actual designed logo (the
 * pink-to-orange gradient V mark already shipped as the PWA/app icon at
 * public/icons/icon-512.png, just never wired into any in-app header).
 * That mark is duplicated here as a dedicated branding asset
 * (public/images/vantrix-logo.png) decoupled from the PWA manifest icon
 * set, so this component is the one place the brand mark is defined —
 * three call sites now render the real logo instead of a text-in-a-box
 * placeholder, and can't drift out of sync with each other again.
 */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/images/vantrix-logo.png"
      alt="Vantrix"
      width={size}
      height={size}
      priority
      className={cn("shrink-0 rounded-xs select-none", className)}
    />
  );
}
