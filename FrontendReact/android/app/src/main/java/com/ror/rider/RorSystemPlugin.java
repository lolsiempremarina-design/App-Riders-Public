package com.ror.rider;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Funzioni di sistema dell'app RoR:
 *  - shareFile: GPX, CSV e dati personali (JSON) si salvano o si inviano con il menu "Condividi" di Android
 *    (nella WebView i download dei file non funzionano);
 *  - showFallAlert / cancelFallAlert: avviso di caduta con l'app in background o lo schermo spento
 *    (canale "cadute", creato dall'app con PushNotifications.createChannel).
 */
@CapacitorPlugin(name = "RorSystem")
public class RorSystemPlugin extends Plugin {

    private static final int FALL_NOTIFICATION_ID = 1001;
    private static final String FALL_CHANNEL = "cadute";
    private static final int MAX_FILE_CHARS = 20 * 1024 * 1024;

    @PluginMethod
    public void shareFile(PluginCall call) {
        String filename = call.getString("filename", "");
        String text = call.getString("text");
        String mimeType = call.getString("mimeType", "text/plain");
        String title = call.getString("title", filename);
        // solo un nome di file semplice: niente percorsi
        if (!filename.matches("[A-Za-z0-9._\\-]{1,120}") || text == null || text.length() > MAX_FILE_CHARS) {
            call.reject("Invalid file");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("cannot create " + dir);
            File file = new File(dir, filename);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mimeType);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, filename);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Unable to share the file", e);
        }
    }

    @PluginMethod
    public void showFallAlert(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("Notifications not allowed");
            return;
        }
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, FALL_NOTIFICATION_ID, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, FALL_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_ror)
            .setColor(ContextCompat.getColor(context, R.color.notification_accent))
            .setContentTitle(call.getString("title", "RoR"))
            .setContentText(call.getString("body", ""))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(call.getString("body", "")))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVibrate(new long[] { 0, 500, 200, 500, 200, 500 })
            .setAutoCancel(true)
            .setContentIntent(pending);
        try {
            NotificationManagerCompat.from(context).notify(FALL_NOTIFICATION_ID, builder.build());
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Notifications not allowed", e);
        }
    }

    @PluginMethod
    public void cancelFallAlert(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(FALL_NOTIFICATION_ID);
        call.resolve();
    }
}
