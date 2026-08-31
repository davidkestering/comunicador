package com.davidkestering.comunicador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        CrashReporter.install(this);
        registerPlugin(BgPlugin.class);
        super.onCreate(savedInstanceState);
        WsService.start(this); // se já logado, garante o serviço rodando
    }
}
