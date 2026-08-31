package com.davidkestering.comunicador;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** Ponte JS -> serviço em segundo plano. requestPermissions() é gerado pelo Capacitor a partir da anotação. */
@CapacitorPlugin(name = "Bg", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class BgPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        String token = call.getString("token");
        if (url == null || token == null) { call.reject("url e token são obrigatórios"); return; }
        WsService.prefs(getContext()).edit().putString("url", url).putString("token", token).apply();
        CrashReporter.trace(getContext(), "BgPlugin.start -> WsService.start");
        WsService.start(getContext());
        call.resolve();
    }

    /** Devolve e limpa o rastro local (diag.log) para o JS enviar ao servidor. */
    @PluginMethod
    public void getDiag(PluginCall call) {
        java.io.File f = new java.io.File(getContext().getFilesDir(), "diag.log");
        String text = "";
        try { if (f.exists()) { text = new String(java.nio.file.Files.readAllBytes(f.toPath()), java.nio.charset.StandardCharsets.UTF_8); f.delete(); } } catch (Exception ignored) {}
        // Motivo registrado pelo Android para as últimas mortes do processo (crash, ANR, morto pelo sistema...).
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            StringBuilder sb = new StringBuilder();
            for (android.app.ApplicationExitInfo e : am.getHistoricalProcessExitReasons(null, 0, 3)) {
                sb.append("EXIT reason=").append(e.getReason()).append(" status=").append(e.getStatus())
                  .append(" at=").append(new java.util.Date(e.getTimestamp())).append(" importance=").append(e.getImportance())
                  .append(" desc=").append(e.getDescription()).append("\n");
            }
            if (sb.length() > 0) text += "\n" + sb;
        } catch (Exception ignored) {}
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("text", text);
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        WsService.prefs(getContext()).edit().clear().apply();
        getContext().stopService(new Intent(getContext(), WsService.class));
        call.resolve();
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context ctx = getContext();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        CrashReporter.trace(ctx, "openBatterySettings ignoring=" + pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        if (!pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) {
            // A partir da Activity e na MESMA tarefa: ao voltar, o usuário cai de novo no app (com NEW_TASK a Xiaomi devolvia à tela inicial).
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName())));
            } catch (Exception e) { // alguns aparelhos não têm essa tela: abre a lista geral
                try { getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); } catch (Exception ignored) {}
            }
        }
        call.resolve();
    }

    // Com o app visível o JS mostra a mensagem; o serviço não precisa notificar.
    @Override protected void handleOnResume() { WsService.appVisible = true; }
    @Override protected void handleOnPause() { WsService.appVisible = false; }
}
