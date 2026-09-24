package pl.btcsygnaly.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Aktualizator aplikacji: pobiera nowy plik APK i otwiera instalator systemu.
 *
 * Android nie pozwala aplikacji spoza sklepu zainstalować się po cichu —
 * ostatnie „Zainstaluj” zawsze naciska użytkownik. Ten moduł robi wszystko,
 * co da się zrobić przed tym krokiem: pobiera plik w tle (bez przeglądarki)
 * i od razu pokazuje systemowy ekran instalacji.
 *
 * Plik trafia do katalogu podręcznego aplikacji, który jest udostępniony
 * instalatorowi przez FileProvider zadeklarowany w manifeście Capacitora.
 */
@CapacitorPlugin(name = "Aktualizator")
public class AktualizatorPlugin extends Plugin {

    private static final String KATALOG = "aktualizacja";
    private static final String PLIK = "btc-sygnaly.apk";
    private static final String PLIK_WERSJI = "wersja.txt";

    private volatile boolean pobieranieTrwa = false;

    /** Czy użytkownik zezwolił tej aplikacji na instalowanie innych APK. */
    @PluginMethod
    public void mozeInstalowac(PluginCall call) {
        JSObject wynik = new JSObject();
        wynik.put("mozna", czyMoznaInstalowac());
        call.resolve(wynik);
    }

    /** Otwiera ekran ustawień, w którym zezwala się na instalację z tej aplikacji. */
    @PluginMethod
    public void otworzUstawieniaInstalacji(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nie udało się otworzyć ustawień: " + e.getMessage());
        }
    }

    /** Która wersja jest już pobrana i czeka na instalację (pusty tekst = żadna). */
    @PluginMethod
    public void pobranaWersja(PluginCall call) {
        JSObject wynik = new JSObject();
        wynik.put("wersja", odczytajPobranaWersje());
        call.resolve(wynik);
    }

    /**
     * Pobiera APK pod wskazanym adresem. W trakcie wysyła zdarzenie „postep”
     * z procentem. Kończy się, gdy plik jest kompletny na dysku.
     */
    @PluginMethod
    public void pobierz(PluginCall call) {
        final String adres = call.getString("url");
        final String wersja = call.getString("wersja", "");
        if (adres == null || adres.isEmpty()) {
            call.reject("Brak adresu pliku aktualizacji");
            return;
        }
        if (pobieranieTrwa) {
            call.reject("Pobieranie już trwa");
            return;
        }

        // Ta sama wersja już leży na dysku – nie ściągamy drugi raz.
        File gotowy = new File(katalog(), PLIK);
        if (!wersja.isEmpty() && wersja.equals(odczytajPobranaWersje()) && gotowy.exists() && gotowy.length() > 0) {
            JSObject wynik = new JSObject();
            wynik.put("wersja", wersja);
            wynik.put("zPamieci", true);
            call.resolve(wynik);
            return;
        }

        pobieranieTrwa = true;
        new Thread(() -> {
            try {
                sciagnij(adres);
                zapiszPobranaWersje(wersja);
                JSObject wynik = new JSObject();
                wynik.put("wersja", wersja);
                wynik.put("zPamieci", false);
                call.resolve(wynik);
            } catch (Exception e) {
                call.reject("Nie udało się pobrać aktualizacji: " + e.getMessage());
            } finally {
                pobieranieTrwa = false;
            }
        }).start();
    }

    /**
     * Otwiera systemowy instalator dla pobranego pliku.
     * Zwraca stan „wymagana-zgoda”, gdy użytkownik musi najpierw zezwolić
     * aplikacji na instalowanie (Android 8+ pyta o to raz na aplikację).
     */
    @PluginMethod
    public void zainstaluj(PluginCall call) {
        File plik = new File(katalog(), PLIK);
        if (!plik.exists() || plik.length() == 0) {
            call.reject("Brak pobranego pliku aktualizacji");
            return;
        }

        JSObject wynik = new JSObject();
        if (!czyMoznaInstalowac()) {
            wynik.put("stan", "wymagana-zgoda");
            call.resolve(wynik);
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                plik
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            wynik.put("stan", "instalator-otwarty");
            call.resolve(wynik);
        } catch (Exception e) {
            call.reject("Nie udało się uruchomić instalatora: " + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ pomocnicze

    private boolean czyMoznaInstalowac() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    private File katalog() {
        File k = new File(getContext().getCacheDir(), KATALOG);
        if (!k.exists()) {
            //noinspection ResultOfMethodCallIgnored
            k.mkdirs();
        }
        return k;
    }

    private String odczytajPobranaWersje() {
        File f = new File(katalog(), PLIK_WERSJI);
        if (!f.exists()) return "";
        try (InputStream we = new java.io.FileInputStream(f)) {
            byte[] bufor = new byte[(int) Math.min(f.length(), 256)];
            int n = we.read(bufor);
            return n > 0 ? new String(bufor, 0, n, StandardCharsets.UTF_8).trim() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private void zapiszPobranaWersje(String wersja) {
        try (OutputStream wy = new FileOutputStream(new File(katalog(), PLIK_WERSJI))) {
            wy.write(wersja.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            // Brak zapisu wersji oznacza tylko, że następnym razem pobierzemy plik ponownie.
        }
    }

    /**
     * Pobieranie z ręczną obsługą przekierowań: GitHub odsyła z adresu wydania
     * na osobny serwer z plikami. Plik powstaje najpierw pod nazwą tymczasową,
     * żeby przerwane pobieranie nie zostawiło uszkodzonego APK.
     */
    private void sciagnij(String adres) throws Exception {
        File docelowy = new File(katalog(), PLIK);
        File tymczasowy = new File(katalog(), PLIK + ".czesc");

        String biezacy = adres;
        HttpURLConnection polaczenie = null;
        for (int skok = 0; ; skok++) {
            if (skok > 8) throw new Exception("zbyt wiele przekierowań");
            polaczenie = (HttpURLConnection) new URL(biezacy).openConnection();
            polaczenie.setInstanceFollowRedirects(false);
            polaczenie.setConnectTimeout(15000);
            polaczenie.setReadTimeout(30000);
            polaczenie.setRequestProperty("User-Agent", "BTC-Sygnaly-Aktualizator");
            int kod = polaczenie.getResponseCode();
            if (kod >= 300 && kod < 400) {
                String dalej = polaczenie.getHeaderField("Location");
                polaczenie.disconnect();
                if (dalej == null) throw new Exception("przekierowanie bez adresu");
                biezacy = new URL(new URL(biezacy), dalej).toString();
                continue;
            }
            if (kod != 200) {
                polaczenie.disconnect();
                throw new Exception("serwer odpowiedział kodem " + kod);
            }
            break;
        }

        long rozmiar = polaczenie.getContentLengthLong();
        long pobrano = 0;
        int ostatniProcent = -1;

        try (InputStream we = polaczenie.getInputStream();
             OutputStream wy = new FileOutputStream(tymczasowy)) {
            byte[] bufor = new byte[16384];
            int n;
            while ((n = we.read(bufor)) != -1) {
                wy.write(bufor, 0, n);
                pobrano += n;
                if (rozmiar > 0) {
                    int procent = (int) (pobrano * 100 / rozmiar);
                    if (procent != ostatniProcent) {
                        ostatniProcent = procent;
                        JSObject postep = new JSObject();
                        postep.put("procent", procent);
                        postep.put("pobrano", pobrano);
                        postep.put("rozmiar", rozmiar);
                        notifyListeners("postep", postep);
                    }
                }
            }
        } finally {
            polaczenie.disconnect();
        }

        if (rozmiar > 0 && pobrano != rozmiar) {
            //noinspection ResultOfMethodCallIgnored
            tymczasowy.delete();
            throw new Exception("plik niekompletny (" + pobrano + " z " + rozmiar + " bajtów)");
        }
        if (docelowy.exists()) {
            //noinspection ResultOfMethodCallIgnored
            docelowy.delete();
        }
        if (!tymczasowy.renameTo(docelowy)) {
            throw new Exception("nie udało się zapisać pliku");
        }
    }
}
