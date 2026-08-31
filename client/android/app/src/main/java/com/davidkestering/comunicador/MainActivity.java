package com.davidkestering.comunicador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        CrashReporter.install(this);
        registerPlugin(BgPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().addWebViewListener(new com.getcapacitor.WebViewListener() {
            @Override public boolean onRenderProcessGone(android.webkit.WebView view, android.webkit.RenderProcessGoneDetail detail) {
                CrashReporter.log(MainActivity.this, "WEBVIEW RENDERER GONE crashed=" + detail.didCrash() + " priority=" + detail.rendererPriorityAtExit());
                return false; // comportamento padrão (app encerra), mas com o motivo registrado
            }
        });
        CrashReporter.log(this, "MainActivity.onCreate");
        WsService.start(this); // se já logado, garante o serviço rodando
    }
}
