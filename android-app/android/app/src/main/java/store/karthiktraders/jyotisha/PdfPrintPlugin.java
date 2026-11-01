package store.karthiktraders.jyotisha;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens Android's print dialog for the page that is showing, which has a "Save as PDF" destination.
 * The page shows only the content to print (see body.printing in app.css) before calling this.
 */
@CapacitorPlugin(name = "PdfPrint")
public class PdfPrintPlugin extends Plugin {
    @PluginMethod
    public void print(final PluginCall call) {
        final String title = call.getString("title", "Jyotisha AI");
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title);
                manager.print(title, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) {
                call.reject("Could not open the print dialog: " + error.getMessage());
            }
        });
    }
}
