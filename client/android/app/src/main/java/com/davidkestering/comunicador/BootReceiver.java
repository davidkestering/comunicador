package com.davidkestering.comunicador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Religa o serviço após reiniciar o celular ou atualizar o app. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        WsService.start(context);
    }
}
