import { NextResponse } from "next/server";

/**
 * Android App Links verification file, served at exactly
 * https://vantrix.app/.well-known/assetlinks.json.
 *
 * package_name must match desktop/src-tauri/tauri.android.conf.json's
 * `identifier` (app.vantrix.mobile). sha256_cert_fingerprints must list
 * the signing cert(s) used to sign the release APK/AAB — get this via:
 *   keytool -list -v -keystore <release-keystore> | grep SHA256
 * (or, once published, from Play Console → Setup → App integrity → App
 * signing key certificate). Supports multiple fingerprints (debug +
 * release) as separate array entries during development; keep only the
 * release fingerprint once the debug build is retired.
 */
const ANDROID_PACKAGE = "app.vantrix.mobile";
const SHA256_FINGERPRINTS = (process.env.ANDROID_SHA256_FINGERPRINTS ?? "REPLACE_WITH_KEYSTORE_SHA256")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

export function GET() {
  const body = [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: SHA256_FINGERPRINTS,
      },
    },
  ];

  return NextResponse.json(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
