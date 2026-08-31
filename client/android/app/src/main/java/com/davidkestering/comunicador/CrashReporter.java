package com.davidkestering.comunicador;

import android.content.Context;
import android.os.Build;

import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Sem adb nos celulares da família: qualquer crash é enviado ao servidor (aparece em `docker logs comunicador-api`). */
public final class CrashReporter {
    private static boolean installed = false;

    static synchronized void install(Context ctx) {
        if (installed) return;
        installed = true;
        String url = WsService.prefs(ctx).getString("url", "https://comunicador.davidkestering.com");
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            StringWriter sw = new StringWriter();
            error.printStackTrace(new PrintWriter(sw));
            String body = "device=" + Build.MANUFACTURER + " " + Build.MODEL + " android=" + Build.VERSION.RELEASE
                + " thread=" + thread.getName() + "\n" + sw;
            Thread t = new Thread(() -> send(url + "/api/crash", body));
            t.start();
            try { t.join(3000); } catch (InterruptedException ignored) {}
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    private static void send(String url, String body) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(2000); c.setReadTimeout(2000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
            c.getResponseCode();
        } catch (Exception ignored) {}
    }
}
