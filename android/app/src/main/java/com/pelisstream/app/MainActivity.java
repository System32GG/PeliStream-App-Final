package com.pelisstream.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.BridgeActivity;

import android.view.View;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.List;

public class MainActivity extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Registrar plugin de Capacitor para la configuracion remota
        registerPlugin(RemoteConfigPlugin.class);
        
        // Descargar la config en segundo plano para el proximo inicio
        RemoteConfigManager.getInstance().fetchRemoteConfig(this);

        // --- OPTIMIZACIONES PILAR 1: El Motor (WebView) ---
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            
            // Caché agresiva
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            
            // Aceleración y Rendimiento
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
            
            // DNS Prefetching
            settings.setSupportMultipleWindows(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);


        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION // hide nav bar
                | View.SYSTEM_UI_FLAG_FULLSCREEN // hide status bar
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }

    @Override
    public void startActivity(Intent intent) {
        // Block external ad popups globally
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri uri = intent.getData();
            if (uri != null) {
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return; // silently discard external browser open
                }
            }
        }
        super.startActivity(intent);
    }
}
