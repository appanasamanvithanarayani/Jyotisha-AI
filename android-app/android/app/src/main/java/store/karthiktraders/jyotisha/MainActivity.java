package store.karthiktraders.jyotisha;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrintPlugin.class);    // plugins must be registered before super.onCreate
        registerPlugin(ShortcutsPlugin.class);
        super.onCreate(savedInstanceState);
        ShortcutsPlugin.handleIntent(getIntent());   // the app was opened from a Shortcuts button
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ShortcutsPlugin.handleIntent(intent);       // a Shortcuts button while the app is already open
    }
}
