# Guía de Construcción LIGERA (Sin Android Studio) 🚀

Si tu PC es humilde, abrir Android Studio puede congelarlo. Sigue estos pasos para generar el APK usando solo la terminal (mucho más ligero).

## Requisitos previos
1. **Node.js** instalado (ya lo tienes).
2. **Java JDK 17** (OBLIGATORIO). Tienes la versión 8 y por eso te da error. Descarga "JDK 17" de Oracle o Microsoft Build of OpenJDK.
3. **Android SDK** (si no lo tienes, descarga solo las "Command line tools" de la web de Android, no hace falta el IDE completo).

### ¿Cómo arreglar el error de "Incompatible Java version"?
El error que te salió (`compatible with Java 11 and the consumer needed Java 8`) significa que tu computadora está intentando compilar con Java 8, pero el Android moderno pide **mínimo Java 11 (recomendado 17)**.
1. Instala el **JDK 17**.
2. Asegúrate de que la variable de entorno `JAVA_HOME` apunte a la carpeta del nuevo JDK 17.
3. Cierra y abre la terminal de nuevo.

### ¿Cómo arreglar el error de "SDK location not found"?
**¡Buenas noticias!** Ya descargué y configuré el SDK básico por vos en `C:\Android\Sdk`. Ya no tenés que descargar nada manualmente.

1. **Estado actual**: Las herramientas base están en `C:\Android\Sdk`.
2. **local.properties**: Ya configuré este archivo en tu proyecto para que apunte a esa carpeta.
3. **Instalación final (Comando Mágico)**: Abrí la terminal y pegá esto para bajar lo que falta (unos 300MB):
   ```powershell
   cd C:\Android\Sdk\cmdline-tools\latest\bin
   ./sdkmanager --sdk_root=C:/Android/Sdk "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   ```
   *(Escribí `y` si te pide aceptar licencias y dale Enter)*.
4. **Compilar**: Volvé a tu carpeta del proyecto, entrá a `android` y corré `./gradlew assembleDebug`.

## Pasos para generar el APK

### 1. Preparar el proyecto
Abre una terminal en la carpeta del proyecto y ejecuta:
```powershell
npm install
npx cap sync
```

### 2. Compilar el APK (Modo ligero)
En lugar de abrir el programa pesado, vamos a usar el "motor" directamente:
```powershell
cd android
./gradlew assembleDebug
```
*Nota: La primera vez descargará archivos necesarios, ten paciencia.*

### 3. Localizar tu APK
Cuando termine (verás un mensaje de "BUILD SUCCESSFUL"), tu archivo estará aquí:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## Comandos rápidos útiles
- **Limpiar build anterior**: `./gradlew clean` (dentro de la carpeta `android`)
- **Actualizar cambios de la web al APK**: `npx cap sync` (en la carpeta raíz) y luego repetir el paso 2.

**¡Listo! Ya tienes tu APK sin haber abierto Android Studio.**
