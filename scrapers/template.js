/**
 * ================================================================
 * PLANTILLA PARA NUEVOS SCRAPERS (PelisStream)
 * ================================================================
 * 
 * INSTRUCCIONES:
 * 1. Copia este archivo y llámalo como tu página (ej. `cuevana.js`).
 * 2. Rellena las funciones `getLatest`, `search` y `getDetail`.
 * 3. En `server.js`, impórtalo: `const cuevana = require('./scrapers/cuevana');`
 * 4. En `server.js` (Rutas /api/home y /api/search) y `public/app.js` (DataSource),
 *    añade la lógica para llamar a tu nuevo scraper si la `source` coincide.
 * 
 * NOTA: Usa `axios` y `cheerio` para extraer los datos como el resto.
 */

const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://ejemplo.com'; // Cambia esto

module.exports = {
  
  /**
   * Obtiene las últimas películas o series agregadas
   * @param {number} page Número de página
   * @returns {Promise<Array>} Lista de películas/series en formato estándar
   */
  async getLatest(page = 1) {
    try {
      const url = `${BASE_URL}/peliculas?page=${page}`; // Ajustar URL
      // const { data } = await axios.get(url);
      // const $ = cheerio.load(data);
      const items = [];
      
      // Lógica de cheerio aquí (ejemplo de formato):
      // items.push({
      //   title: 'Ejemplo de Película',
      //   year: '2025',
      //   image: 'https://ejemplo.com/poster.jpg',
      //   url: 'https://ejemplo.com/peli/1',
      //   type: 'movie', // o 'series'
      //   source: 'ejemplo' // IMPORTANTE: El nombre corto de tu fuente (se capitalizará automáticamente en la app)
      // });

      return items;
    } catch (error) {
      console.error('[Scraper] Error getLatest:', error.message);
      return [];
    }
  },

  /**
   * Igual que getLatest pero para series exclusivamente
   */
  async getLatestSeries(page = 1) {
    // Igual que getLatest, pero apuntando a la URL de series de tu página
    return [];
  },

  /**
   * Busca contenido por nombre
   * @param {string} query Texto a buscar
   * @returns {Promise<Array>} Resultados
   */
  async search(query) {
    try {
      const url = `${BASE_URL}/buscar?q=${encodeURIComponent(query)}`;
      // extraer resultados...
      return [];
    } catch (error) {
      return [];
    }
  },

  /**
   * Obtiene los detalles y los enlaces de video
   * @param {string} url La url específica de la película/serie
   * @returns {Promise<Object>} Formato estricto para detalles
   */
  async getDetail(url) {
    try {
      // res incluye titulo, descripcion, portada y 'servers'
      const res = { 
        title: '', 
        year: '', 
        image: '', 
        description: '', 
        genres: [], 
        servers: [], // { name: 'Fembed', embedUrl: 'https://...' }
        seasons: [], // Solo si type es 'series'
        type: 'movie', 
        url, 
        source: 'ejemplo' 
      };

      // Implementar extracción aquí (ver pelisplus.js para un ejemplo real)

      return res;
    } catch (error) {
      return null;
    }
  },

  /**
   * Obtiene servidores de un episodio específico (si es serie)
   */
  async getEpisodeServers(url) {
    // Retornar un arreglo como: [{ name: 'Server1', embedUrl: 'https...' }]
    return [];
  }
};
