package pl.btcsygnaly.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Główna aktywność. Jedyna zmiana względem szablonu Capacitora: rejestracja
 * własnego modułu aktualizatora — musi nastąpić PRZED super.onCreate(),
 * inaczej most JavaScript–Java go nie zobaczy.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AktualizatorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
