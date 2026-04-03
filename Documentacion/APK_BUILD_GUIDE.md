# PelisStream - Guía de Construcción del APK

## Requisitos
- Node.js y npm instalados
- Android Studio (para compilar) **O** usar GitHub Actions (sin Android Studio)

## Paso 1: Configurar Capacitor

```bash
# Instalar dependencias de Capacitor
npm install @capacitor/core @capacitor/cli @capacitor/android

# Inicializar Capacitor (ya está configurado en capacitor.config.ts)
npx cap init PelisStream com.pelisstream.app --web-dir public

# Agregar plataforma Android
npx cap add android

# Sincronizar los archivos web
npx cap sync android
```

## Paso 2: Configurar el WebView para el APK

Después de `npx cap add android`, editar `android/app/src/main/AndroidManifest.xml`:

Agregar dentro de `<application>`:
```xml
android:usesCleartextTraffic="true"
android:networkSecurityConfig="@xml/network_security_config"
```

Crear `android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

## Paso 3: Configurar la URL del servidor

En `capacitor.config.ts`, descomentar y configurar la URL de tu servidor:
```typescript
server: {
  url: 'http://TU_IP:3000', // IP de tu PC en la red local
  cleartext: true,
}
```

## Paso 4: Compilar el APK

### Opción A: Con Android Studio
```bash
npx cap open android
# Luego Build > Build Bundle(s) / APK(s) > Build APK(s)
```

### Opción B: Desde la terminal
```bash
cd android
./gradlew assembleDebug
# El APK estará en: android/app/build/outputs/apk/debug/app-debug.apk
```

## Notas importantes

7. El servidor Node.js debe estar ejecutándose en tu PC para que el APK funcione
2. Tu celular y tu PC deben estar en la **misma red WiFi**
3. Usa `ipconfig` (Windows) para encontrar tu IP local
4. El APK se conecta a `http://TU_IP:3000`

## Paso 5: Cambiar el Icono de la APK (Opcional)

Si deseas personalizar el icono que aparece en el menú de aplicaciones de tu Android:

1. **Prepara tu Icono (formato PNG)**
   Debes tener tu imagen final en formato `.png` (no uses `.ico`). La resolución ideal es de `512x512` píxeles, sin fondo o con fondo de color sólido. Llámalo `icon.png`.

2. **Herramienta Capacitor Assets**
   Instala la herramienta de generación oficial si no la tienes:
   ```bash
   npm install @capacitor/assets --save-dev
   ```

3. **La carpeta `assets`**
   Crea una carpeta llamada `assets` en el directorio principal (donde está `package.json`).
   Coloca tu archivo `icon.png` dentro de esa carpeta.

4. **Regenerar Iconos**
   Ejecuta el siguiente comando para generar todos los tamaños automáticamente:
   ```bash
   npx @capacitor/assets generate --android
   ```
   *Esto reemplazará los iconos por defecto en `android/app/src/main/res/mipmap-*`.*

5. **Recompilar**
   Vuelve a construir el APK desde Android Studio o con `./gradlew assembleDebug` para ver los cambios aplicados en la nueva app-debug.apk.
