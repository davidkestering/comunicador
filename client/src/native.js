import { Capacitor, registerPlugin } from '@capacitor/core';
import { API, getToken, trace } from './api.js';

const Bg = registerPlugin('Bg');
export const isNative = Capacitor.isNativePlatform();

// Envia ao servidor o rastro/crash gravado localmente pelo lado nativo na execução anterior.
export async function uploadDiag() {
  if (!isNative) return;
  try {
    const { text } = await Bg.getDiag();
    if (text) await trace(`diag(java) enviado em ${new Date().toISOString()}\n${text}`);
  } catch (e) { trace(`uploadDiag ERRO: ${e?.message || e}`); }
}

// Liga o serviço em segundo plano (Android). No navegador não faz nada.
export async function startBackground() {
  if (!isNative) return;
  await uploadDiag();
  await new Promise((r) => setTimeout(r, 1500)); // deixa o rastro JS sair antes do serviço nativo iniciar
  try {
    trace('startBackground: requestPermissions');
    const perm = await Bg.requestPermissions();
    trace(`permissions=${JSON.stringify(perm)}; Bg.start`);
    await Bg.start({ url: API, token: getToken() });
    trace('Bg.start ok');
    if (!localStorage.getItem('batteryAsked')) { localStorage.setItem('batteryAsked', '1'); trace('openBatterySettings'); await Bg.openBatterySettings(); trace('openBatterySettings ok'); }
  } catch (e) { trace(`startBackground ERRO: ${e?.message || e}`); console.warn('bg', e); }
}
export const stopBackground = () => (isNative ? Bg.stop().catch(() => {}) : undefined);
export const openBatterySettings = () => (isNative ? Bg.openBatterySettings().catch(() => {}) : undefined);
