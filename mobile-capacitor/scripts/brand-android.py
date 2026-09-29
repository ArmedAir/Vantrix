#!/usr/bin/env python3
"""
Applies every Vantrix-specific native customization to the generated
android/ project. Idempotent: run after `cap add android` (npm run
android:regen does both). Nothing here is hand-edited in android/ so the
native project can always be regenerated from scratch.

What it sets up: invisible native splash (the animated web BootSplash is the
only opening), launcher + notification icons, hardened manifest (deep links,
push permission, no backup, no cleartext), R8 minify/shrink for release,
env-driven release signing + version numbers, faster Gradle builds.
"""
import os, re, glob
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ANDROID = os.path.join(ROOT, 'android')
RES = os.path.join(ANDROID, 'app/src/main/res')
PUB = os.path.abspath(os.path.join(ROOT, '..', 'public', 'icons'))
BG = (10, 10, 10)

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write(text)

# ── 1. Splash: solid #0A0A0A at every density (Capacitor ships a logo) ─────
for f in glob.glob(f'{RES}/drawable*/splash.png'):
    w, h = Image.open(f).size
    Image.new('RGB', (w, h), BG).save(f, optimize=True)

# ── 2. Launcher icons from the real heart ───────────────────────────────────
src = Image.open(f'{PUB}/icon-512.png').convert('RGBA')
mask = Image.open(f'{PUB}/icon-maskable-512.png').convert('RGBA')
legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
fg = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
for d, s in legacy.items():
    os.makedirs(f'{RES}/mipmap-{d}', exist_ok=True)
    for n in ('ic_launcher.png', 'ic_launcher_round.png'):
        src.resize((s, s), Image.LANCZOS).save(f'{RES}/mipmap-{d}/{n}')
    mask.resize((fg[d], fg[d]), Image.LANCZOS).save(f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
for f in glob.glob(f'{RES}/drawable-v24/ic_launcher_foreground.xml'):
    os.remove(f)
adaptive = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
write(f'{RES}/mipmap-anydpi-v26/ic_launcher.xml', adaptive)
write(f'{RES}/mipmap-anydpi-v26/ic_launcher_round.xml', adaptive)
write(f'{RES}/drawable/ic_launcher_background.xml', '''<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#0A0A0A"/>
</shape>
''')

# ── 3. Status-bar notification icon: white silhouette (Android requires
#      a monochrome alpha icon; a coloured one renders as a grey square) ────
lum = src.convert('L').point(lambda v: 255 if v > 40 else 0)
sil = Image.new('RGBA', src.size, (255, 255, 255, 0))
sil.putalpha(lum)
for d, s in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
    os.makedirs(f'{RES}/drawable-{d}', exist_ok=True)
    sil.resize((s, s), Image.LANCZOS).save(f'{RES}/drawable-{d}/ic_stat_vantrix.png')

# ── 4. Invisible Android 12+ splash icon ────────────────────────────────────
write(f'{RES}/drawable/splash_transparent.xml', '''<?xml version="1.0" encoding="utf-8"?>
<!-- Fully transparent on purpose: Android 12+ insists on a splash icon and we
     want none, so the web app's animated launch splash is the only opening. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#00000000" android:pathData="M0,0h24v24h-24z"/>
</vector>
''')

# ── 5. Themes ───────────────────────────────────────────────────────────────
write(f'{RES}/values/styles.xml', '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:windowBackground">#0A0A0A</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowBackground">#0A0A0A</item>
        <item name="android:navigationBarColor">#0A0A0A</item>
        <item name="android:statusBarColor">#0A0A0A</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>

    <!-- ONE OPENING ONLY: invisible native splash (solid #0A0A0A, transparent
         icon) so the web app's animated BootSplash is the only launch
         animation. Android 12+ reads windowSplashScreen*; older reads
         android:background. -->
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">#0A0A0A</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/splash_transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:navigationBarColor">#0A0A0A</item>
        <item name="android:statusBarColor">#0A0A0A</item>
    </style>
</resources>
''')
write(f'{RES}/values/colors.xml', '''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#0A0A0A</color>
    <color name="colorPrimaryDark">#0A0A0A</color>
    <color name="colorAccent">#C9A227</color>
    <color name="vantrix_notification">#C9A227</color>
</resources>
''')

# ── 6. Manifest ─────────────────────────────────────────────────────────────
write(f'{ANDROID}/app/src/main/AndroidManifest.xml', '''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- allowBackup=false: session cookies/tokens must not be copied into
         cloud backups or adb backups. usesCleartextTraffic=false: https only. -->
    <application
        android:allowBackup="false"
        android:fullBackupContent="false"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <meta-data android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_vantrix" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color"
            android:resource="@color/vantrix_notification" />

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:windowSoftInputMode="adjustResize"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Verified App Links: https://vantrix.ink/... opens the app.
                 Needs /.well-known/assetlinks.json (served by the web app;
                 set ANDROID_SHA256_FINGERPRINTS). Also brings users back from
                 external checkout pages. -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="vantrix.ink" />
            </intent-filter>

            <!-- Custom scheme: vantrix://chat/123 -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="vantrix" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.VIBRATE" />
</manifest>
''')
write(f'{RES}/xml/data_extraction_rules.xml', '''<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup><exclude domain="root"/><exclude domain="file"/><exclude domain="database"/><exclude domain="sharedpref"/></cloud-backup>
    <device-transfer><exclude domain="root"/><exclude domain="file"/><exclude domain="database"/><exclude domain="sharedpref"/></device-transfer>
</data-extraction-rules>
''')

# ── 7. build.gradle: release signing, R8, versioning ────────────────────────
gp = f'{ANDROID}/app/build.gradle'
g = open(gp).read()
if 'VANTRIX-RELEASE' not in g:
    g = g.replace('versionCode 1', 'versionCode Integer.parseInt(System.getenv("VERSION_CODE") ?: "1") // VANTRIX-RELEASE')
    g = g.replace('versionName "1.0"', 'versionName System.getenv("VERSION_NAME") ?: "1.0.0"')
    g = g.replace('    buildTypes {', '''    // Release signing comes from env (CI secrets) -- never from files in git.
    signingConfigs {
        release {
            def ks = System.getenv("ANDROID_KEYSTORE_PATH")
            if (ks) {
                storeFile file(ks)
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {''', 1)
    g = re.sub(r'release \{\s*minifyEnabled false',
               'release {\n            minifyEnabled true\n            shrinkResources true\n            if (System.getenv("ANDROID_KEYSTORE_PATH")) { signingConfig signingConfigs.release }',
               g, count=1)
    open(gp, 'w').write(g)

write(f'{ANDROID}/app/proguard-rules.pro', '''# Keep Capacitor's JS bridge + plugin classes: they are looked up by reflection.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { @com.getcapacitor.annotation.PluginMethod public <methods>; }
-keep class com.google.firebase.** { *; }
-keepattributes *Annotation*, SourceFile, LineNumberTable
''')

# ── 8. Faster Gradle ────────────────────────────────────────────────────────
gpp = f'{ANDROID}/gradle.properties'
gr = open(gpp).read()
gr = re.sub(r'org\.gradle\.jvmargs=.*', 'org.gradle.jvmargs=-Xmx3g -XX:+UseParallelGC', gr)
if 'org.gradle.caching' not in gr:
    gr += '\norg.gradle.parallel=true\norg.gradle.caching=true\nandroid.nonTransitiveRClass=true\n'
open(gpp, 'w').write(gr)

# ── 9. MainActivity: WebView tuning ─────────────────────────────────────────
main = glob.glob(f'{ANDROID}/app/src/main/java/**/MainActivity.java', recursive=True)[0]
pkg = re.search(r'package ([\w.]+);', open(main).read()).group(1)
write(main, f'''package {pkg};

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        super.onCreate(savedInstanceState);
        WebView web = getBridge().getWebView();
        // No rubber-band/glow overscroll: feels like a native screen, not a page.
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        // HTTP cache: serve _next/static + images from disk when unchanged.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setDomStorageEnabled(true);
        // Voice replies / video previews shouldn't need an extra tap.
        s.setMediaPlaybackRequiresUserGesture(false);
        // Ignore the OS font-size scale so the layout matches the web design.
        s.setTextZoom(100);
    }}
}}
''')
print('branding applied')
