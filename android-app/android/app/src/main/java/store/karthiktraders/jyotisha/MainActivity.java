package store.karthiktraders.jyotisha;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrintPlugin.class);    // plugins must be registered before super.onCreate
        registerPlugin(ShortcutsPlugin.class);
        registerPlugin(SystemBarsPlugin.class);   // status bar hidden; navigation bar colour follows the app's look
        super.onCreate(savedInstanceState);
        SystemBarsPlugin.hideStatusBar(getWindow());   // applied here too so it never flashes in before the first JS call
        ShortcutsPlugin.handleIntent(getIntent());   // the app was opened from a Shortcuts button
        // The phone's Back button goes back through the app's own screens; only on the first screen does it close
        // the app. The page tracks its own navigation stack in JS (window.__jyotishaBack()) and is asked directly,
        // rather than trusting the WebView's built-in back/forward list, which can behave unreliably with a
        // pushState-only single-page app on some devices.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) { closeApp(); return; }
                web.evaluateJavascript("(window.__jyotishaBack && window.__jyotishaBack()) ? 'true' : 'false'", value -> {
                    if (!"\"true\"".equals(value)) closeApp();
                });
            }

            private void closeApp() {
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShortcutsPlugin.handleIntent(intent);       // a Shortcuts button while the app is already open
    }

    @Override
    public void onResume() {   // Capacitor's BridgeActivity.onResume() is public; overriding it as protected fails to compile
        super.onResume();
        SystemBarsPlugin.hideStatusBar(getWindow());   // back from another app or the notification shade: hide it again
    }
}
