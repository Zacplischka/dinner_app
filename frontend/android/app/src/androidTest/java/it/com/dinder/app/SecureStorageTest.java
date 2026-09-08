package it.com.dinder.app;

import static org.junit.Assert.*;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.whitestein.securestorage.PasswordStorageHelper;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real Keystore checks. All keys/preferences are isolated from the installed app's data. */
@RunWith(AndroidJUnit4.class)
public class SecureStorageTest {
    private final Context context = new ContextWrapper(
        InstrumentationRegistry.getInstrumentation().getTargetContext()
    ) {
        @Override public String getPackageName() { return super.getPackageName() + ".storageTest"; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) {
            return super.getSharedPreferences(name + ".storageTest", mode);
        }
    };
    private final String key = "synthetic-token";

    private SharedPreferences prefs() {
        return context.getSharedPreferences("cap_sec", Context.MODE_PRIVATE);
    }

    @After public void cleanup() throws Exception {
        assertTrue(prefs().edit().clear().commit());
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        store.deleteEntry(context.getPackageName() + "_cap_sec");
    }

    @Test public void persistsEncryptedDataAndRejectsCorruption() {
        PasswordStorageHelper storage = new PasswordStorageHelper(context);
        byte[] value = ("synthetic-🔐-" + new String(new char[1024]).replace('\0', 'x'))
            .getBytes(StandardCharsets.UTF_8);
        storage.setData(key, value);
        assertArrayEquals(value, new PasswordStorageHelper(context).getData(key));
        assertNotEquals(Base64.encodeToString(value, Base64.DEFAULT), prefs().getString(key, null));

        assertTrue(prefs().edit().putString(key, Base64.encodeToString(new byte[256], Base64.DEFAULT)).commit());
        assertThrows(IllegalStateException.class, () -> storage.getData(key));
        storage.remove(key);
        assertNull(storage.getData(key));
    }

    @Test public void failedInitializationNeverFallsBackToPlaintext() {
        Context failing = new ContextWrapper(context) {
            @Override public String getPackageName() {
                throw new IllegalStateException("Injected Keystore initialization failure");
            }
        };
        PasswordStorageHelper storage = new PasswordStorageHelper(failing);
        assertThrows(IllegalStateException.class, () -> storage.setData(key, new byte[] {1, 2, 3}));
        assertThrows(IllegalStateException.class, () -> storage.getData(key));
        assertThrows(IllegalStateException.class, () -> storage.remove(key));
        assertThrows(IllegalStateException.class, storage::clear);
        assertFalse(prefs().contains(key));
    }

    @Test public void failedDiskCommitIsNotReportedAsSuccess() {
        Context failing = new ContextWrapper(context) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                SharedPreferences original = super.getSharedPreferences(name, mode);
                return (SharedPreferences) Proxy.newProxyInstance(
                    SharedPreferences.class.getClassLoader(), new Class<?>[] {SharedPreferences.class},
                    (proxy, method, args) -> {
                        if (!method.getName().equals("edit")) return method.invoke(original, args);
                        SharedPreferences.Editor editor = original.edit();
                        return Proxy.newProxyInstance(SharedPreferences.Editor.class.getClassLoader(),
                            new Class<?>[] {SharedPreferences.Editor.class}, (p, m, a) ->
                                m.getName().equals("commit") ? false : m.invoke(editor, a));
                    }
                );
            }
        };
        PasswordStorageHelper storage = new PasswordStorageHelper(failing);
        assertThrows(IllegalStateException.class, () -> storage.setData(key, new byte[] {1, 2, 3}));
        assertThrows(IllegalStateException.class, () -> storage.remove(key));
        assertThrows(IllegalStateException.class, storage::clear);
    }
}
