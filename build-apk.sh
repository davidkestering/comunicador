#!/bin/sh
# Gera o APK assinado (release) usando Docker (JDK 21 + Android SDK em volumes locais em docker/).
# Uso: ./build-apk.sh            -> data/comunicador.apk  (servido em https://comunicador.davidkestering.com/comunicador.apk)
set -e
cd "$(dirname "$0")"
ROOT=$(pwd)
[ -f docker/keystore/.env ] || { echo "Falta docker/keystore/.env (KEYSTORE_PASSWORD, KEY_ALIAS)"; exit 1; }

echo ">> Build do client web + sync Capacitor"
(cd client && npm run build >/dev/null && npx cap sync android >/dev/null)

echo ">> Gradle assembleRelease no container (primeira vez baixa SDK/Gradle: ~10 min)"
docker run --rm \
  --env-file docker/keystore/.env \
  -v "$ROOT/client/android:/proj" \
  -v "$ROOT/client/node_modules:/node_modules" \
  -v "$ROOT/docker/android-sdk:/sdk" \
  -v "$ROOT/docker/gradle-cache:/root/.gradle" \
  -v "$ROOT/docker/keystore:/keys:ro" \
  -m 2500m \
  comunicador-android-build \
  ./gradlew assembleRelease --no-daemon --console=plain -q

APK=client/android/app/build/outputs/apk/release/app-release.apk
mkdir -p data && cp "$APK" data/comunicador.apk
echo ">> OK: data/comunicador.apk ($(du -h data/comunicador.apk | cut -f1))"
