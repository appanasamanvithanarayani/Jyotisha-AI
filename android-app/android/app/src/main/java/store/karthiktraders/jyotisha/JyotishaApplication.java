package store.karthiktraders.jyotisha;

import android.app.Application;
import android.util.Log;

import com.facebook.FacebookSdk;

/** Initializes Meta App Events early enough to attribute the first app activation/install. */
public final class JyotishaApplication extends Application {
    private static final String TAG = "JyotishaMetaEvents";

    @Override
    @SuppressWarnings("deprecation") // Meta still exposes sdkInitialize for explicit initialization.
    public void onCreate() {
        super.onCreate();

        String appId = BuildConfig.META_APP_ID;
        String clientToken = BuildConfig.META_CLIENT_TOKEN;
        if (appId.isEmpty() || clientToken.isEmpty()) {
            if (BuildConfig.DEBUG) Log.i(TAG, "Meta App Events disabled: credentials are not configured");
            return;
        }

        FacebookSdk.setApplicationId(appId);
        FacebookSdk.setClientToken(clientToken);
        FacebookSdk.sdkInitialize(this);
        FacebookSdk.fullyInitialize();
        Log.i(TAG, "Meta App Events initialized");
    }
}
