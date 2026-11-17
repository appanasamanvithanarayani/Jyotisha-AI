package store.karthiktraders.jyotisha;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's status bar (time, Wi-Fi, battery) is hidden for a clean, full-screen look (the user can still pull it
 * down with a swipe from the top edge; it hides again on its own). The navigation bar keeps the app's colour: the
 * page calls set({ color: "#1a0b24", light: false }) whenever the look changes (mystic / dark: dark bar with light
 * icons, light: cream bar with dark icons). On Android 15+ the app draws edge to edge and the bar is transparent, so
 * the window background behind it is coloured too. hideStatusBar() is also applied directly in MainActivity at
 * launch, so the status bar never flashes into view before the first JS call lands.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    static void hideStatusBar(Window window) {
        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.statusBars());
    }

    @PluginMethod
    public void set(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#1A0B24"));
        } catch (IllegalArgumentException error) {
            call.reject("color must look like #1a0b24");
            return;
        }
        final boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.setBackgroundDrawable(new ColorDrawable(color));
            window.getDecorView().setBackgroundColor(color);
            if (Build.VERSION.SDK_INT < 35) {   // older Android still paints the bar from this
                window.setNavigationBarColor(color);
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightNavigationBars(light);
            hideStatusBar(window);
            call.resolve();
        });
    }
}
