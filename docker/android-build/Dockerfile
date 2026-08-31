# Imagem de build do APK. O SDK Android NÃO fica na imagem: é baixado 1x para o volume local docker/android-sdk.
FROM eclipse-temurin:21-jdk
RUN apt-get update && apt-get install -y --no-install-recommends unzip curl ca-certificates && apt-get clean
ENV ANDROID_HOME=/sdk ANDROID_SDK_ROOT=/sdk GRADLE_USER_HOME=/root/.gradle \
    PATH=$PATH:/sdk/cmdline-tools/latest/bin:/sdk/platform-tools
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /proj
ENTRYPOINT ["/entrypoint.sh"]
