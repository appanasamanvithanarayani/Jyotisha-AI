package store.karthiktraders.jyotisha;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.net.URISyntaxException;

/**
 * Lets Razorpay Checkout work inside the app's WebView, as Razorpay's "UPI Intent in WebView - Android" guide asks:
 * links to UPI apps (upi://, intent://, tez://, phonepe://, …) open that app instead of failing, and bank / 3-D Secure
 * pages loading inside Razorpay's frame stay in the app instead of being sent to Chrome (where the app would never
 * learn the payment finished). Everything else keeps Capacitor's normal behaviour.
 */
public class PaymentWebViewClient extends BridgeWebViewClient {
    private final Activity activity;

    public PaymentWebViewClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https") && !scheme.equals("data") && !scheme.equals("blob")) {
            openExternalApp(url.toString());
            return true;
        }
        if (!request.isForMainFrame()) return false;   // a payment step inside Razorpay's frame: load it right there
        return super.shouldOverrideUrlLoading(view, request);
    }

    private void openExternalApp(String url) {
        try {
            Intent intent = url.startsWith("intent:")
                    ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);   // never let a web page target a specific component directly
            activity.startActivity(intent);
        } catch (ActivityNotFoundException | URISyntaxException e) {
            if (url.startsWith("intent:")) {
                try {
                    String fallback = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
                    if (fallback != null) activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                } catch (URISyntaxException | ActivityNotFoundException ignored) {
                    // no UPI app and no fallback: Razorpay Checkout still offers its other payment methods
                }
            }
        }
    }
}
