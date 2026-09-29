package app.vantrix.mobile;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
    }
}
