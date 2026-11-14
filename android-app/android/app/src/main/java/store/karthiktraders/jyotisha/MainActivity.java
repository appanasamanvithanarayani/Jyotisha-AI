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
        super.onCreate(savedInstanceState);
        ShortcutsPlugin.handleIntent(getIntent());   // the app was opened from a Shortcuts button
        // The phone's Back button goes back through the app's screens (the page records each one in the WebView's
        // history); only on the first screen does it close the app as usual.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                    return;
                }
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
}
