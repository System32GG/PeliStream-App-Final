package com.pelisstream.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

@CapacitorPlugin(name = "RemoteConfig")
public class RemoteConfigPlugin extends Plugin {

    @PluginMethod
    public void getBases(PluginCall call) {
        try {
            String jsonStr = RemoteConfigManager.getInstance().getConfigJson(getContext());
            JSObject ret = new JSObject(jsonStr);
            call.resolve(ret);
        } catch (JSONException e) {
            call.reject("Failed to parse config: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Failed to get bases: " + e.getMessage());
        }
    }
}
