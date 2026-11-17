package app.ledgerleaf.budget;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the widget summary from the app (already translated and formatted) and redraws the widgets. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(SpendWidget.PREFS, Context.MODE_PRIVATE).edit().putString("data", call.getString("data", "")).apply();
        SpendWidget.refreshAll(ctx);
        call.resolve();
    }
}
