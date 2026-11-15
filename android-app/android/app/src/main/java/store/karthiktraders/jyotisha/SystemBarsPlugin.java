package store.karthiktraders.jyotisha;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's status bar (time, Wi-Fi, battery) and navigation bar follow the app's look: the page calls
 * set({ color: "#1a0b24", light: false }) whenever the look changes (mystic / dark: dark bars with light icons,
 * light: cream bars with dark icons). On Android 15+ the app draws edge to edge and the bars are transparent, so the
 * window background behind them is coloured too.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
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
            if (Build.VERSION.SDK_INT < 35) {   // older Android still paints the bars from these
                window.setStatusBarColor(color);
                window.setNavigationBarColor(color);
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(light);
            controller.setAppearanceLightNavigationBars(light);
            call.resolve();
        });
    }
}
