# Seguridad en PelisStream

Esta aplicación ha sido diseñada teniendo en cuenta la seguridad del usuario al acceder a sitios de streaming que suelen estar plagados de publicidad invasiva.

## 1. Bloqueo de Popups (Ads) Automático
El archivo `public/index.html` cuenta con un script inyectado en la cabecera (`<head>`) que redefine la función `window.open` del navegador.
- **¿Qué hace?**: Cuando haces clic en el botón de reproducir y el servidor de video intenta abrir una pestaña nueva (pop-under) con anuncios (ej. "adfly", "popcash"), el script lo detecta por su patrón de URL y bloquea la acción.
- **Resultado**: Puedes hacer clic tranquilamente en los videos sin que se te abran mil pestañas no deseadas.

## 2. Proxy Transparente
En lugar de cargar los reproductores de video directamente (lo cual expondría tu conexión a cookies de rastreo antes de tiempo y podría fallar por problemas de CORS), PelisStream utiliza un proxy inverso incluído en `server.js`.
- **¿Qué hace?**: Cuando solicitas un video, es tu servidor local (o el backend de la app) quien hace la petición a "PoseidonHD" o "PelisPlus". El proxy "limpia" el código de ciertas cabeceras restrictivas (X-Frame-Options) e inyecta otro bloqueador de anuncios extra directamente en el HTML del reproductor.
- **Resultado**: Los sitios externos tienen mucho más difícil rastrearte o inyectarte scripts dañinos porque estás viendo el contenido a través de un "túnel" seguro.

## 3. Privacidad Absoluta (Sin Cuentas)
La aplicación no requiere registro, correos, contraseñas ni base de datos centralizada.
- **El Historial**: La sección de "Vistos Recientemente" guarda los datos exclusivamente en el `localStorage` de tu navegador o celular.
- **Resultado**: Solo tú tienes acceso a lo que ves. No hay telemetría ni envío de datos a terceros.
