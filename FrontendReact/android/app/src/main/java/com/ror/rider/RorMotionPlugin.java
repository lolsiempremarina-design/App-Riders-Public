package com.ror.rider;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.PowerManager;
import android.os.SystemClock;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Accelerometro e giroscopio per il rilevamento cadute anche con l'app in background o lo schermo spento.
 *
 * La WebView non riceve più "devicemotion" quando l'app non è in primo piano: qui i sensori si leggono in
 * nativo a 20 Hz e i campioni arrivano al FallDetector JavaScript (lo stesso della PWA) a blocchi di 250 ms,
 * con le stesse unità di DeviceMotionEvent (m/s² con la gravità, rotazione in gradi/s).
 * Durante la sessione tiene la CPU attiva (PARTIAL_WAKE_LOCK); il processo resta vivo grazie al servizio in
 * primo piano del GPS (plugin background-geolocation).
 */
@CapacitorPlugin(name = "RorMotion")
public class RorMotionPlugin extends Plugin implements SensorEventListener {

    private static final int SAMPLE_US = 50_000; // 20 Hz
    private static final long SAMPLE_MS = 50;
    private static final long BATCH_MS = 250;
    private static final long MAX_WAKE_LOCK_MS = 12L * 60 * 60 * 1000; // rete di sicurezza: un turno
    private static final double RAD_TO_DEG = 180.0 / Math.PI;

    private SensorManager sensors;
    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private final float[] gyro = new float[3];
    private boolean hasGyro;
    private long lastSampleMs;
    private JSArray batch = new JSArray();
    private boolean running;

    private final Runnable emitBatch = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            if (batch.length() > 0) {
                JSObject data = new JSObject();
                data.put("samples", batch);
                batch = new JSArray();
                notifyListeners("motion", data);
            }
            handler.postDelayed(this, BATCH_MS);
        }
    };

    @PluginMethod
    public void start(PluginCall call) {
        JSObject result = new JSObject();
        if (running) {
            result.put("available", true);
            call.resolve(result);
            return;
        }
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        Sensor accelerometer = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        if (accelerometer == null) {
            result.put("available", false);
            call.resolve(result);
            return;
        }
        thread = new HandlerThread("ror-motion");
        thread.start();
        handler = new Handler(thread.getLooper());
        running = true;
        hasGyro = false;
        lastSampleMs = 0;
        sensors.registerListener(this, accelerometer, SAMPLE_US, handler);
        Sensor gyroscope = sensors.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
        if (gyroscope != null) sensors.registerListener(this, gyroscope, SAMPLE_US, handler);

        PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (power != null) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RoR:fall-detection");
            wakeLock.acquire(MAX_WAKE_LOCK_MS);
        }
        handler.postDelayed(emitBatch, BATCH_MS);
        result.put("available", true);
        result.put("gyroscope", gyroscope != null);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopSensors();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopSensors();
        super.handleOnDestroy();
    }

    private void stopSensors() {
        if (!running) return;
        running = false;
        if (sensors != null) sensors.unregisterListener(this);
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        thread = null;
        handler = null;
        batch = new JSArray();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!running) return;
        if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
            System.arraycopy(event.values, 0, gyro, 0, 3);
            hasGyro = true;
            return;
        }
        // orario del campione (ms dall'epoca), dal tempo del sensore misurato dall'avvio del telefono
        long timeMs = System.currentTimeMillis() - (SystemClock.elapsedRealtimeNanos() - event.timestamp) / 1_000_000L;
        if (timeMs - lastSampleMs < SAMPLE_MS) return;
        lastSampleMs = timeMs;

        JSObject sample = new JSObject();
        sample.put("t", timeMs);
        sample.put("x", event.values[0]);
        sample.put("y", event.values[1]);
        sample.put("z", event.values[2]);
        if (hasGyro) {
            // come DeviceMotionEvent.rotationRate: alpha = asse z, beta = asse x, gamma = asse y
            sample.put("alpha", gyro[2] * RAD_TO_DEG);
            sample.put("beta", gyro[0] * RAD_TO_DEG);
            sample.put("gamma", gyro[1] * RAD_TO_DEG);
        }
        batch.put(sample);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
