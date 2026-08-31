package com.davidkestering.comunicador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Serviço em primeiro plano (tipo specialUse: sem timeout no Android 15, pode iniciar no boot).
 * Mantém um WebSocket com o servidor; ao receber {"t":"new"} mostra notificação. As mensagens ficam no servidor.
 */
public class WsService extends Service {
    static final String CH_SERVICE = "servico", CH_MSG = "mensagens";
    static final int NOTIF_SERVICE = 1;
    static volatile boolean appVisible = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private OkHttpClient client;
    private WebSocket ws;
    private boolean running = false, connected = false;
    private int delayMs = 2000;
    private ConnectivityManager.NetworkCallback netCallback;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("bg", Context.MODE_PRIVATE); }

    static void start(Context c) {
        if (prefs(c).getString("token", null) == null) return;
        ContextCompat.startForegroundService(c, new Intent(c, WsService.class));
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CH_SERVICE, "Conexão em segundo plano", NotificationManager.IMPORTANCE_MIN));
        NotificationChannel msg = new NotificationChannel(CH_MSG, "Mensagens", NotificationManager.IMPORTANCE_HIGH);
        msg.enableVibration(true);
        nm.createNotificationChannel(msg);
        client = new OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).retryOnConnectionFailure(true).build();
        // Reconecta na hora quando a rede volta (Wi-Fi <-> dados), sem esperar o backoff.
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        netCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network n) { handler.post(() -> { if (running && !connected) reconnectNow(); }); }
        };
        cm.registerDefaultNetworkCallback(netCallback);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        ServiceCompat.startForeground(this, NOTIF_SERVICE, serviceNotification("Conectando…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        if (!running) { running = true; connect(); }
        return START_STICKY;
    }

    @Override public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        if (ws != null) ws.close(1000, "bye");
        try { getSystemService(ConnectivityManager.class).unregisterNetworkCallback(netCallback); } catch (Exception ignored) {}
        super.onDestroy();
    }

    private void reconnectNow() {
        handler.removeCallbacksAndMessages(null);
        if (ws != null) ws.cancel();
        delayMs = 2000;
        connect();
    }

    private void connect() {
        String url = prefs(this).getString("url", null), token = prefs(this).getString("token", null);
        if (url == null || token == null) { stopSelf(); return; }
        String wsUrl = url.replaceFirst("^http", "ws") + "/ws?token=" + token;
        ws = client.newWebSocket(new Request.Builder().url(wsUrl).build(), new WebSocketListener() {
            @Override public void onOpen(WebSocket w, Response r) {
                connected = true; delayMs = 2000;
                update("Conectado");
            }
            @Override public void onMessage(WebSocket w, String text) { handleMessage(text); }
            @Override public void onClosed(WebSocket w, int code, String reason) { connected = false; scheduleReconnect(); }
            @Override public void onFailure(WebSocket w, Throwable t, Response r) {
                connected = false;
                if (r != null && r.code() == 401) { update("Sessão inválida — abra o app"); return; } // token revogado: não insistir
                scheduleReconnect();
            }
        });
    }

    private void scheduleReconnect() {
        if (!running) return;
        update("Reconectando…");
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::connect, delayMs);
        delayMs = Math.min(delayMs * 2, 60_000);
    }

    private void handleMessage(String text) {
        try {
            JSONObject o = new JSONObject(text);
            if (!"new".equals(o.optString("t")) || !o.has("from") || appVisible) return;
            JSONObject from = o.getJSONObject("from"), msg = o.getJSONObject("msg");
            String type = msg.optString("type"), body = "text".equals(type) ? msg.optString("body") : "audio".equals(type) ? "🎤 Áudio" : "📎 Arquivo";
            Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, from.optInt("id"), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification n = new NotificationCompat.Builder(this, CH_MSG)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(from.optString("name")).setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true).setContentIntent(pi).setDefaults(Notification.DEFAULT_ALL).build();
            getSystemService(NotificationManager.class).notify(100 + from.optInt("id"), n);
        } catch (Exception ignored) {}
    }

    private Notification serviceNotification(String status) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CH_SERVICE)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("Comunicador ativo").setContentText(status)
            .setOngoing(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_MIN).setContentIntent(pi).build();
    }

    private void update(String status) {
        getSystemService(NotificationManager.class).notify(NOTIF_SERVICE, serviceNotification(status));
    }
}
