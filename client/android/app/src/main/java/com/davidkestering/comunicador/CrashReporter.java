package com.davidkestering.comunicador;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Sem adb nos celulares da família: qualquer crash é enviado ao servidor (aparece em `docker logs comunicador-api`). */
public final class CrashReporter {
    private static boolean installed = false;

    /** Rastro local síncrono: sobrevive à morte do processo; o JS envia na próxima abertura (Bg.getDiag). */
    static synchronized void log(Context ctx, String msg) {
        try {
            File f = new File(ctx.getFilesDir(), "diag.log");
            if (f.length() > 500_000) f.delete();
            try (FileOutputStream fo = new FileOutputStream(f, true)) {
                fo.write((new java.util.Date() + " pid=" + android.os.Process.myPid() + " " + msg + "\n").getBytes(StandardCharsets.UTF_8));
                fo.getFD().sync();
            }
        } catch (Exception ignored) {}
    }

    static synchronized void install(Context ctx) {
        if (installed) return;
        installed = true;
        String url = WsService.prefs(ctx).getString("url", "https://comunicador.davidkestering.com") + "/api/crash";
        File pending = new File(ctx.getFilesDir(), "crash-pending.txt");
        // Crash anterior ocorrido sem rede: reenvia agora, em segundo plano.
        if (pending.exists()) new Thread(() -> {
            try { if (send(url, new String(Files.readAllBytes(pending.toPath()), StandardCharsets.UTF_8))) pending.delete(); } catch (Exception ignored) {}
        }).start();
        String ver;
        try { ver = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName; } catch (Exception e) { ver = "?"; }
        final String appVersion = ver;
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            StringWriter sw = new StringWriter();
            error.printStackTrace(new PrintWriter(sw));
            String body = "app=" + appVersion + " device=" + Build.MANUFACTURER + " " + Build.MODEL + " android=" + Build.VERSION.RELEASE
                + " thread=" + thread.getName() + " at=" + new java.util.Date() + "\n" + sw;
            log(ctx, "CRASH " + body);
            final boolean[] sent = { false };
            Thread t = new Thread(() -> sent[0] = send(url, body));
            t.start();
            try { t.join(3000); } catch (InterruptedException ignored) {}
            if (!sent[0]) try (FileOutputStream fo = new FileOutputStream(pending, true)) { fo.write(body.getBytes(StandardCharsets.UTF_8)); } catch (Exception ignored) {}
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    /** Breadcrumb assíncrono (não bloqueia, ignora falhas). */
    static void trace(Context ctx, String msg) {
        log(ctx, msg);
        String url = WsService.prefs(ctx).getString("url", "https://comunicador.davidkestering.com") + "/api/crash";
        new Thread(() -> send(url, "trace(java): " + msg + " | " + Build.MANUFACTURER + " " + Build.MODEL + " android=" + Build.VERSION.RELEASE)).start();
    }

    private static boolean send(String url, String body) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(2000); c.setReadTimeout(2000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "text/plain; charset=utf-8");
            try (OutputStream os = c.getOutputStream()) { os.write(body.getBytes(StandardCharsets.UTF_8)); }
            return c.getResponseCode() == 200;
        } catch (Exception e) { return false; }
    }
}
