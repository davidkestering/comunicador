#!/bin/sh
# Garante o SDK no volume /sdk (docker/android-sdk) e executa o comando (gradlew ...).
set -e
CMDLINE_URL=https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
if [ ! -x /sdk/cmdline-tools/latest/bin/sdkmanager ]; then
  echo ">> Baixando Android cmdline-tools para /sdk (uma vez)"
  mkdir -p /sdk/cmdline-tools && cd /tmp && curl -sSL -o ct.zip "$CMDLINE_URL" && unzip -q ct.zip && rm ct.zip
  mv cmdline-tools /sdk/cmdline-tools/latest && cd /proj
fi
if [ ! -d /sdk/platforms/android-36 ] || [ ! -d /sdk/build-tools/36.0.0 ]; then
  echo ">> Instalando platform-tools, android-36, build-tools 36.0.0 (uma vez)"
  yes | sdkmanager --sdk_root=/sdk --licenses >/dev/null 2>&1 || true
  sdkmanager --sdk_root=/sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0"
fi
exec "$@"
