package store.karthiktraders.jyotisha;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A silent, pinned "Shortcuts" notification with four buttons (Palm, Rashiphal, Tarot, Match) that open those screens.
 * The page shows it after the user has allowed notifications; the labels come from the page in the user's language.
 * A tap reaches the page as a "shortcut" event { page } (kept until the page listens, if the app was closed).
 */
@CapacitorPlugin(name = "Shortcuts")
public class ShortcutsPlugin extends Plugin {
    static final String EXTRA_PAGE = "jyotisha_shortcut";
    private static final String CHANNEL = "shortcuts";
    private static final int NOTIFICATION_ID = 7990;
    private static final int[] BUTTONS = { R.id.shortcut_button_0, R.id.shortcut_button_1, R.id.shortcut_button_2, R.id.shortcut_button_3 };
    private static final int[] LABELS = { R.id.shortcut_label_0, R.id.shortcut_label_1, R.id.shortcut_label_2, R.id.shortcut_label_3 };
    private static final String[] DEFAULT_LABELS = { "Palm", "Rashiphal", "Tarot", "Match" };
    private static final String[] DEFAULT_PAGES = { "palm", "rashi", "tarot", "match" };

    private static ShortcutsPlugin instance;
    private static String pendingPage;   // a tap that opened the app before this plugin was loaded

    @Override
    public void load() {
        instance = this;
        if (pendingPage != null) {
            send(pendingPage);
            pendingPage = null;
        }
    }

    /** Called by MainActivity for the launch intent and for every new intent (a tap while the app is open). */
    static void handleIntent(Intent intent) {
        if (intent == null) return;
        String page = intent.getStringExtra(EXTRA_PAGE);
        if (page == null) return;
        intent.removeExtra(EXTRA_PAGE);
        if (instance != null) instance.send(page);
        else pendingPage = page;
    }

    private void send(String page) {
        JSObject data = new JSObject();
        data.put("page", page);
        notifyListeners("shortcut", data, true);   // retained until the page adds its listener
    }

    @PluginMethod
    public void show(PluginCall call) {
        Context context = getContext();
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        JSObject result = new JSObject();
        if (!manager.areNotificationsEnabled()) {
            result.put("shown", false);
            call.resolve(result);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, call.getString("channelName", "Shortcuts"), NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            NotificationManager system = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (system != null) system.createNotificationChannel(channel);
        }
        String title = call.getString("title", "Your stars, one tap from here");
        String text = call.getString("text", "Choose a reading to start.");
        JSArray labels = call.getArray("labels", new JSArray());
        JSArray pages = call.getArray("pages", new JSArray());

        RemoteViews small = new RemoteViews(context.getPackageName(), R.layout.notification_shortcuts_small);
        small.setTextViewText(R.id.shortcut_title, title);
        small.setTextViewText(R.id.shortcut_text, text);
        RemoteViews big = new RemoteViews(context.getPackageName(), R.layout.notification_shortcuts);
        big.setTextViewText(R.id.shortcut_title, title);
        big.setTextViewText(R.id.shortcut_text, text);
        for (int i = 0; i < BUTTONS.length; i++) {
            String label = labels.optString(i, DEFAULT_LABELS[i]);
            String page = pages.optString(i, DEFAULT_PAGES[i]);
            big.setTextViewText(LABELS[i], label);
            big.setOnClickPendingIntent(BUTTONS[i], openPage(page, i));
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_jyotisha)
            .setColor(0xFFE8822B)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setContentIntent(openPage("home", 9))
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        try {
            manager.notify(NOTIFICATION_ID, builder.build());
            result.put("shown", true);
            call.resolve(result);
        } catch (SecurityException error) {
            result.put("shown", false);
            call.resolve(result);
        }
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private PendingIntent openPage(String page, int code) {
        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setAction("store.karthiktraders.jyotisha.SHORTCUT_" + page);   // distinct actions keep the four intents apart
        intent.putExtra(EXTRA_PAGE, page);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(getContext(), 8000 + code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
