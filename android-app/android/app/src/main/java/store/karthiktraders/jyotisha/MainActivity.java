package store.karthiktraders.jyotisha;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PdfPrintPlugin.class);   // must be registered before super.onCreate
        super.onCreate(savedInstanceState);
    }
}
