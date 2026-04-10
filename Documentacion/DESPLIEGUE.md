# Guía de Despliegue: Render & Vercel

He preparado los archivos necesarios para que puedas desplegar PeliStream rápidamente.

## 🚀 Paso 1: Desplegar el Backend en Render

1. Ve a [dashboard.render.com](https://dashboard.render.com).
2. Selecciona **New +** > **Blueprint**.
3. Conecta tu repositorio de GitHub.
4. Render leerá el archivo `render.yaml` y configurará el servicio `pelistream-backend`.
5. Una vez desplegado, copia la URL que te da Render (ejemplo: `https://pelistream-backend.onrender.com`).

## 🌐 Paso 2: Configurar el Frontend en Vercel

1. Abre el archivo `vercel.json` que acabo de crear en la raíz de tu proyecto.
2. Reemplaza `https://TU_URL_DE_RENDER.onrender.com` con la URL real de tu backend en Render.
3. Guarda los cambios, haz commit y push a GitHub:
   ```bash
   git add vercel.json
   git commit -m "Configure Render URL for Vercel proxy"
   git push
   ```
4. Ve a [vercel.com](https://vercel.com).
5. Dale a **Add New** > **Project** e importa tu repo.
6. En **Framework Preset** deja **Other**.
7. Haz clic en **Deploy**.

## 📝 Notas importantes
- **CORS**: Ya está habilitado en `server.js`, así que no tendrás problemas de permisos.
- **Vercel Proxy**: Usamos `vercel.json` para que las llamadas a `/api/*` se redirijan automáticamente al backend. Esto evita errores de "Mixed Content" y facilita el desarrollo.
- **Render Free Tier**: Recuerda que en el plan gratuito el backend se apaga tras 15 minutos de inactividad y tarda unos segundos en despertar.
