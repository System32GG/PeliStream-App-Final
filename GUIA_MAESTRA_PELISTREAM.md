# 📖 Guía Maestra Técnica: PeliStream "Eterna"

Este documento contiene la explicación **absoluta y detallada** de cada componente del proyecto, su propósito individual y cómo se conectan entre sí para formar el ecosistema de PeliStream.

---

## 🏗️ 1. Visión General de la Arquitectura
PeliStream es un **agregador de contenido** que funciona bajo una arquitectura de "Espejo". La lógica de extracción de datos (scraping) existe tanto en el servidor (Node.js) como en el cliente (Capacitor/Android) para que la app sea funcional sin depender de un servidor central si se usa el APK.

### Los dos mundos de PeliStream:
1.  **Entorno PC/Web**: El usuario corre `server.js`. El servidor Node.js hace el trabajo sucio de visitar las webs de películas y enviar solo los resultados limpios al navegador.
2.  **Entorno APK (Android/TV)**: La app detecta que es "Nativa". Ignora al servidor y ejecuta `scraper.js` directamente en el televisor, usando los permisos del sistema para saltarse bloqueos de seguridad (CORS).

---

## 📂 2. Desglose de Archivos y Responsabilidades

### 📁 Raíz del Proyecto (Configuración y Control)
*   **`server.js`**: El motor del backend. 
    *   *Función*: Levanta un servidor Express, gestiona el **Proxy de Video** (para que los videos no se bloqueen por anuncios), y sincroniza el **Remote Config** cada 30 minutos.
    *   *Relación*: Es el "padre" en modo PC. Provee los datos que `app.js` consume mediante `fetch`.
*   **`capacitor.config.ts`**: Configuración de Capacitor.
    *   *Función*: Define el ID del paquete (`com.pelisstream.app`), el nombre de la app y habilita el plugin `CapacitorHttp` (vital para el scraping nativo).
*   **`package.json`**: Lista de dependencias (Express, Axios, Cheerio, Capacitor).
*   **`Iniciar.vbs` / `Parar.bat`**: Scripts de conveniencia para Windows que inician o detienen el servidor Node.js en segundo plano (modo "silencioso").

### 📁 Frontend (`/public`) - El Corazón Visual
*   **`index.html`**: La estructura base.
    *   *Detalle*: Contiene el **Modal del Reproductor** y los contenedores dinámicos. Incluye un script preventivo para bloquear pop-ups de anuncios que intenten abrir ventanas nuevas.
*   **`styles.css`**: El sistema de diseño.
    *   *Detalle*: Implementa un diseño oscuro "Glassmorphism". Está optimizado para TVs de bajos recursos (sin efectos de desenfoque costosos). Controla que el reproductor no tape los botones en pantallas horizontales.
*   **`app.js`**: La lógica de la aplicación.
    *   *Función*: Gestiona el cambio de pestañas (Películas/Series/Historial), abre el modal, solicita los datos a `DataSource` y maneja los eventos del control remoto (D-Pad).
    *   *Relación*: Usa a `scraper.js` (en móvil) o al servidor (en PC) a través del objeto `DataSource`.
*   **`scraper.js`**: El motor de extracción del cliente.
    *   *Función*: Contiene las funciones para "leer" el HTML de PelisPlus, Poseidon, etc. Es capaz de identificar dónde está el video y dónde están los capítulos.
    *   *Relación*: Sus funciones son llamadas por `app.js` cuando el usuario busca o hace clic en una película.

### 📁 Scrapers de Servidor (`/scrapers`)
*   **`pelisplus.js`, `poseidon.js`, etc.**: Estos archivos son **gemelos** de la lógica en `scraper.js`, pero escritos para Node.js usando `cheerio`.
    *   *Relación*: El archivo `server.js` los importa para servir los datos cuando usas la app desde un navegador en PC.

### 📁 Código Nativo Android (`/android/app/src/main/java/...`)
*   **`MainActivity.java`**: El punto de entrada en Android.
    *   *Función*: Configura el WebView nativo para que tenga **Aceleración por Hardware** (crucial para que el video no vaya a saltos en la TV) y oculta las barras del sistema (modo inmersivo).
*   **`RemoteConfigManager.java`**: El guardián de la configuración.
    *   *Función*: Descarga el JSON de tu GitHub Gist de forma segura. Tiene un "limpiador" de texto que detecta si escribiste mal el JSON (como dejar una coma al final) y lo arregla antes de que la app falle.
*   **`RemoteConfigPlugin.java`**: El puente (Bridge).
    *   *Función*: Permite que el código JavaScript (`scraper.js`) le pregunte al sistema Android: "¿Tienes la configuración nueva?".

---

## 🔄 3. Flujo de Datos: El Camino de una Búsqueda

Para entender cómo se relacionan los archivos, sigamos el rastro de una acción: **El usuario busca "Batman" en la TV.**

1.  **`app.js`** detecta el texto en el buscador. 
2.  Como es modo nativo, llama a **`DataSource.search()`**.
3.  **`DataSource`** usa las funciones de **`scraper.js`**.
4.  **`scraper.js`** primero mira cuál es la URL actual (BaseURL) que le dio el **`RemoteConfigPlugin`**.
5.  **`scraper.js`** hace un `fetch` a esa URL (ej: `pelisplushd.bz/search?q=batman`).
6.  **`scraper.js`** recibe el HTML de la web externa, lo "destripa" buscando títulos y posters, y le devuelve una lista limpia a `app.js`.
7.  **`app.js`** genera las tarjetas visuales en el `index.html` usando las clases de `styles.css`.

---

## ⚙️ 4. Sistema "Eterno" (Remote Config)

La "magia" de que la app no muera nunca reside aquí:

1.  Tu editas el **GitHub Gist**.
2.  **`RemoteConfigManager.java`** lo detecta al abrir la app.
3.  **`scraper.js`** recibe las nuevas URLs.
4.  **`app.js`** reacciona al evento `configLoaded`: si en el Gist borraste una página, `app.js` oculta inmediatamente el botón de esa página para que el usuario no vea errores.

---

## 📺 5. Optimizaciones Críticas para Android TV

*   **Foco Automático (`app.js`)**: Las TVs no tienen ratón. El código en el bloque `finally` de la carga de detalles busca botones (`.server-btn`) y les obliga a recibir el foco del control remoto.
*   **Scroll Protegido (`styles.css`)**: El reproductor se limita a `55vh` para que el sistema de navegación de Android TV siempre vea que hay "algo" debajo y permita bajar con las flechas.
*   **WebView High Priority (`MainActivity.java`)**: Se le indica al procesador de la TV que la App de PeliStream es la prioridad #1, evitando parpadeos negros o cierres inesperados.

---
**Este proyecto es un círculo perfecto**: El código nativo protege la ejecución, el JavaScript maneja la interfaz y tu Gist en la nube controla el destino de todos.
