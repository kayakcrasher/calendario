package com.kayakcrasher.calendario;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import io.objectbox.BoxStore;
import io.objectbox.meshsync.android.AndroidMeshSync;
import io.objectbox.sync.MeshConfig;
import io.objectbox.sync.Sync;
import io.objectbox.sync.SyncClient;
import io.objectbox.sync.SyncCredentials;

@CapacitorPlugin(
    name = "MeshSync",
    permissions = {
        @Permission(alias = "bluetooth", strings = {
            android.Manifest.permission.BLUETOOTH_ADVERTISE,
            android.Manifest.permission.BLUETOOTH_CONNECT,
            android.Manifest.permission.BLUETOOTH_SCAN
        }),
        @Permission(alias = "location", strings = {
            android.Manifest.permission.ACCESS_FINE_LOCATION
        }),
        @Permission(alias = "wifi", strings = {
            android.Manifest.permission.NEARBY_WIFI_DEVICES
        })
    }
)
public class MeshSyncPlugin extends Plugin {
    private static final String TAG = "MeshSyncPlugin";
    private static final String MESH_ID = "com.kayakcrasher.calendario.mesh";
    private static final String SYNC_URL = "ws://sync.objectbox.io:9999";

    private BoxStore boxStore;
    private SyncClient syncClient;

    @Override
    public void load() {
        Context ctx = getContext();
        try {
            // Open (or create) the ObjectBox store.
            // Replace Note.class with your entity classes when you add them.
            boxStore = MyObjectBox.builder()
                .androidContext(ctx)
                .name("calendario-db")
                .build();

            // Request all required runtime permissions.
            requestAllPermissions(new PluginCall() {
                // no-op; permission result handled by Capacitor
            }.getCallbackId() == null ? null : null, "bluetooth");
            // Simpler: call requestPermissionForAlias for each alias
            // (see Capacitor docs for the multi-permission pattern)

            MeshConfig meshConfig = AndroidMeshSync.createConfig(ctx, MESH_ID);

            syncClient = Sync.client(boxStore)
                .url(SYNC_URL)
                .credentials(SyncCredentials.none())
                .mesh(meshConfig)
                .buildAndStart();

            Log.i(TAG, "Mesh Sync started");
        } catch (Exception e) {
            Log.e(TAG, "Mesh Sync init failed", e);
        }
    }

    @PluginMethod
    public void syncNow(PluginCall call) {
        JSObject ret = new JSObject();
        if (syncClient == null) {
            ret.put("ok", false);
            ret.put("error", "sync client not initialized");
            call.resolve(ret);
            return;
        }
        ret.put("ok", true);
        ret.put("meshId", MESH_ID);
        ret.put("peerCount", syncClient.getMesh() != null
            ? syncClient.getMesh().getConnectedPeerCount()
            : 0);
        call.resolve(ret);
    }

    @PluginMethod
    public void getPeers(PluginCall call) {
        JSObject ret = new JSObject();
        if (syncClient == null || syncClient.getMesh() == null) {
            ret.put("peers", 0);
        } else {
            ret.put("peers", syncClient.getMesh().getConnectedPeerCount());
        }
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (syncClient != null) {
            syncClient.stop();
            syncClient = null;
        }
        if (boxStore != null) {
            boxStore.close();
            boxStore = null;
        }
        super.handleOnDestroy();
    }
}
