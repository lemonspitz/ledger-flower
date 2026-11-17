package app.ledgerleaf.budget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/** Home-screen widget: this month's spending, budget left with a bar, today's spending, and a quick "+" to add. */
public class SpendWidget extends AppWidgetProvider {
    static final String PREFS = "ledgerflower_widget";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) draw(ctx, mgr, id);
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (int id : mgr.getAppWidgetIds(new ComponentName(ctx, SpendWidget.class))) draw(ctx, mgr, id);
    }

    static void draw(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_spend);
        String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null);
        JSONObject o = null;
        try { if (raw != null && !raw.isEmpty()) o = new JSONObject(raw); } catch (Exception ignored) { }
        if (o == null) {
            v.setTextViewText(R.id.w_title, "Ledger Flower");
            v.setTextViewText(R.id.w_value, "—");
            v.setTextViewText(R.id.w_sub, ctx.getString(R.string.widget_open_app));
            v.setViewVisibility(R.id.w_bar, View.GONE);
            v.setViewVisibility(R.id.w_today, View.GONE);
        } else {
            String now = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            boolean sameMonth = now.startsWith(o.optString("month", "x"));
            boolean sameDay = now.equals(o.optString("date"));
            v.setTextViewText(R.id.w_title, o.optString("title"));
            v.setTextViewText(R.id.w_value, sameMonth ? o.optString("value") : "—");
            v.setTextViewText(R.id.w_sub, sameMonth ? o.optString("sub") : o.optString("stale"));
            int p = o.optInt("progress", -1);
            v.setViewVisibility(R.id.w_bar, sameMonth && p >= 0 ? View.VISIBLE : View.GONE);
            if (p >= 0) v.setProgressBar(R.id.w_bar, 100, Math.min(100, p), false);
            v.setTextColor(R.id.w_sub, ctx.getColor(sameMonth && o.optBoolean("over") ? R.color.widget_over : R.color.widget_muted));
            v.setViewVisibility(R.id.w_today, sameDay ? View.VISIBLE : View.GONE);
            v.setTextViewText(R.id.w_today, o.optString("today"));
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 0, new Intent(ctx, MainActivity.class), flags));
        Intent add = new Intent(Intent.ACTION_VIEW, Uri.parse("ledgerflower://add"), ctx, MainActivity.class);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(ctx, 1, add, flags));
        mgr.updateAppWidget(id, v);
    }
}
