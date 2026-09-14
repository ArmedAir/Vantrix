"use client";

import { useEffect, useRef } from "react";

/**
 * THIRD-PARTY-AD-NETWORK: generic container-div + async-script loader,
 * deliberately not wired to a named vendor.
 *
 * Vantrix is an adult/companion-app product — mainstream ad networks
 * (Google AdSense chief among them) reject that content category outright
 * at the publisher-approval step, so hardcoding an AdSense-shaped
 * integration here would just be dead code. What's built instead is the
 * integration shape every ad-permitted network for this category
 * (ExoClick, JuicyAds, TrafficJunky, EroAdvertising, ...) actually uses:
 * a `<div id="container-{zoneId}">` the network's own async script finds
 * and fills. Whichever network gets signed up, wiring it in is three env
 * vars — no code change here.
 *
 * Renders nothing (not even the container div) unless
 * NEXT_PUBLIC_AD_NETWORK_ENABLED is explicitly 'true' AND both the script
 * URL and zone id are set — an unconfigured network must be inert, not an
 * empty box holding layout space for nothing. Read directly via
 * process.env (not the server-only `@/env` module — see that file's own
 * NEXT_PUBLIC_R2_PUBLIC_URL comment for why) since this is a Client
 * Component.
 *
 * Caller decides *when* this is safe to mount — see AppChrome, which
 * only renders this for free-tier users (paid = the "No ads" tier
 * benefit already promised on /premium, see tiers/config.ts) and never
 * on an immersive /chat or /roleplay route, so a third-party creative
 * can never land next to an active NSFW conversation regardless of what
 * the eventual network's own targeting does.
 */
export function ThirdPartyAdSlot() {
  const scriptInjected = useRef(false);
  const enabled = process.env.NEXT_PUBLIC_AD_NETWORK_ENABLED === "true";
  const scriptUrl = process.env.NEXT_PUBLIC_AD_NETWORK_SCRIPT_URL;
  const zoneId = process.env.NEXT_PUBLIC_AD_NETWORK_ZONE_ID;
  const ready = enabled && !!scriptUrl && !!zoneId;

  useEffect(() => {
    if (!ready || scriptInjected.current) return;
    scriptInjected.current = true;

    const script = document.createElement("script");
    script.src = scriptUrl!;
    script.async = true;
    script.dataset.adNetworkSlot = "true";
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      scriptInjected.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scriptUrl]);

  if (!ready) return null;

  return <div id={`container-${zoneId}`} className="w-full overflow-hidden rounded-md" />;
}
