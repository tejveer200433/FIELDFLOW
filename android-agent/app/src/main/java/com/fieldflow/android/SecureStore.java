package com.fieldflow.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Auth and queued samples never leave app-private storage unencrypted. */
final class SecureStore {
    private final File directory;
    SecureStore(Context context) { directory = context.getNoBackupFilesDir(); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias("fieldflow.v1")) {
            KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("fieldflow.v1", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey("fieldflow.v1", null);
    }
    synchronized void write(String name, byte[] bytes) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(bytes);
        AtomicFile file = new AtomicFile(new File(directory, name));
        FileOutputStream out = file.startWrite();
        try {
            out.write(cipher.getIV()); out.write(encrypted); file.finishWrite(out);
        } catch (Exception error) { file.failWrite(out); throw error; }
    }
    synchronized byte[] read(String name) throws Exception {
        AtomicFile file = new AtomicFile(new File(directory, name));
        if (!file.getBaseFile().exists()) return null;
        byte[] bytes = file.readFully();
        if (bytes.length < 28) throw new IllegalStateException("Saved data is unreadable. Sign in again.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Arrays.copyOf(bytes, 12)));
        return cipher.doFinal(bytes, 12, bytes.length - 12);
    }
    synchronized void remove(String name) { new AtomicFile(new File(directory, name)).delete(); }
}
