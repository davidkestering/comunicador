import { Capacitor, registerPlugin } from '@capacitor/core';
import { API, getToken } from './api.js';

const Bg = registerPlugin('Bg');
export const isNative = Capacitor.isNativePlatform();

// Liga o serviço em segundo plano (Android). No navegador não faz nada.
export async function startBackground() {
  if (!isNative) return;
  try {
    await Bg.requestPermissions();
    await Bg.start({ url: API, token: getToken() });
    if (!localStorage.getItem('batteryAsked')) { localStorage.setItem('batteryAsked', '1'); await Bg.openBatterySettings(); }
  } catch (e) { console.warn('bg', e); }
}
export const stopBackground = () => (isNative ? Bg.stop().catch(() => {}) : undefined);
export const openBatterySettings = () => (isNative ? Bg.openBatterySettings().catch(() => {}) : undefined);
