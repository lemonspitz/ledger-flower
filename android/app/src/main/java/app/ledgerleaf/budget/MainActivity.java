package app.ledgerleaf.budget;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class); // lets the app hand the home-screen widget its numbers
        super.onCreate(savedInstanceState);
    }
}
