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
            try {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception e) { // alguns aparelhos não têm essa tela: abre a lista geral
                try {
                    ctx.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (Exception ignored) {}
            }
        }
        call.resolve();
    }

    // Com o app visível o JS mostra a mensagem; o serviço não precisa notificar.
    @Override protected void handleOnResume() { WsService.appVisible = true; }
    @Override protected void handleOnPause() { WsService.appVisible = false; }
}
