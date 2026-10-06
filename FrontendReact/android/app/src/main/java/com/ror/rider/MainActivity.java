package com.ror.rider;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // plugin locali dell'app (prima di super.onCreate, che avvia il bridge)
        registerPlugin(RorMotionPlugin.class);
        registerPlugin(RorSystemPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
