package com.pelisstream.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class RemoteConfigManager {
    private static final String TAG = "RemoteConfigManager";
    private static final String PREF_NAME = "PelisStreamConfig";
    private static final String KEY_CONFIG = "remote_config_json";

    // Reemplazamos la URL por la tuya. Eliminamos el hash del commit para que siempre devuelva el json más actual que pongas en el gist.
    private static final String CONFIG_URL = "https://gist.githubusercontent.com/System32GG/451f98f13899c2c77b0948e5bc28f9f2/raw/config.json";

    private static final String DEFAULT_JSON = "{" +
            "\"pelisplus\": [\"https://pelisplushd.bz\", \"https://pelisplus.app\", \"https://pelisplushd.net\"]," +
            "\"poseidon\": [\"https://www.poseidonhd2.co\", \"https://poseidonhd2.co\", \"https://www.poseidonhd.co\"]," +
            "\"pelisplus_la\": [\"https://www.pelisplushd.la\"]," +
            "\"cuevana\": [\"https://ww9.cuevana3.to\"]" +
            "}";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static RemoteConfigManager instance;

    private RemoteConfigManager() {}

    public static synchronized RemoteConfigManager getInstance() {
        if (instance == null) {
            instance = new RemoteConfigManager();
        }
        return instance;
    }

    public void fetchRemoteConfig(Context context) {
        executor.execute(() -> {
            try {
                URL url = new URL(CONFIG_URL + "?t=" + System.currentTimeMillis());
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setUseCaches(false); // FORZAR no usar caché de Android
                conn.setRequestProperty("Cache-Control", "no-cache");
                conn.setRequestProperty("Pragma", "no-cache");

                if (conn.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    String jsonResponse = sb.toString();
                    
                    // Limpieza de seguridad: Elimina comas sobrantes al final de arrays o objetos (útil por si se edita el JSON a mano)
                    jsonResponse = jsonResponse.replaceAll(",(\\s*[}\\]])", "$1");
                    
                    // Valida que sea un JSON válido; si no, lanza excepción y no corrompe la DB
                    new JSONObject(jsonResponse);

                    SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
                    prefs.edit().putString(KEY_CONFIG, jsonResponse).apply();
                    Log.d(TAG, "Configuración remota actualizada correctamente.");
                } else {
                    Log.e(TAG, "Fallo al obtener la configuración remota: HTTP " + conn.getResponseCode());
                }
                conn.disconnect();
            } catch (Exception e) {
                Log.e(TAG, "Error obteniendo configuración remota", e);
            }
        });
    }

    public String getConfigJson(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_CONFIG, DEFAULT_JSON);
    }
}
