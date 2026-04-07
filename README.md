# PeliStream

Agregador de streaming para películas y series. Diseñado para funcionar como servidor local (Node.js) y como aplicación nativa en Android TV.

## 🚀 Inicio Rápido

### Prerrequisitos (Manual)
Antes de ejecutar cualquier comando, debes descargar e instalar manualmente:
1. **Node.js (v18 o superior)**: Consíguelo en [nodejs.org](https://nodejs.org/). (Esto activará el comando `npm`).
2. **Java JDK 17**: Necesario para compilar la App de Android.
3. **Android Studio**: Con el SDK de Android y soporte para TV (Leanback) configurado.
4. **Capacitor CLI**: (Opcional) Instálalo globalmente una vez tengas Node: `npm install -g @capacitor/cli`

### Instalación desde cero
1. Clonar el repositorio.
2. Instalar dependencias de Node: `npm install`
3. Sincronizar el proyecto de Android con los últimos cambios de la App: `npx cap sync android`
4. Iniciar servidor: `npm start`
5. Abrir la carpeta `android` en Android Studio para compilar el APK de la TV.

### Scripts Útiles
- Iniciar servidor: `npm start`
- Modo desarrollo: `npm run dev` (requiere nodemon)
- Ejecutar todos los tests: `npm test`

## 📁 Estructura del Proyecto

- `/scrapers`: Módulos de Node.js para extraer datos de los proveedores (Pelisplus, Poseidon, etc).
- `/public`: Frontend de la aplicación (HTML/JS).
    - `scraper.js`: Motor de búsqueda standalone para Android.
- `/android`: Proyecto nativo de Capacitor para Android TV.
- `/icons`: Activos visuales del proyecto.
- `/tests`: Pruebas automatizadas.

## 🛠️ Mejoras Recientes

- **Seguridad**: Sanitización de inputs en servidor y móvil para evitar inyecciones.
- **Rendimiento**: 
    - Caché de 30-60 min en el servidor.
    - Caché local (localStorage) en Android para cargas instantáneas.
- **Android TV**: Soporte para Launcher Leanback y Banner personalizado para que aparezca en el inicio de la TV.
- **Rate Limiting**: Protección global contra abuso de la API (60 req/min).

## 📝 Notas
- El archivo `config.json` se sincroniza automáticamente desde un GitHub Gist cada 30 minutos.
- Las dependencias están fijas a versiones exactas para evitar fallos por actualizaciones automáticas.
