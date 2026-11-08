package com.forma.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Single-activity host for the FORMA web app.
 *
 * <p>The Vite build in {@code ../dist} is copied into the APK assets and served
 * through {@link WebViewAssetLoader} from a synthetic https origin. That origin
 * matters: {@code getUserMedia} (the nutrition scanner) and {@code localStorage}
 * (every screen reads and writes it) both require a secure context, which a
 * {@code file://} URL would not provide.
 */
public final class MainActivity extends ComponentActivity {

    private static final String TAG = "Forma";
    private static final String TAG_WEB = "FormaWeb";

    private static final String ASSET_HOST = "appassets.androidplatform.net";

    /** Where the Vite output lands inside the APK assets. */
    private static final String START_PATH = "public/index.html";

    private static final String BUNDLED_URL =
            "https://" + ASSET_HOST + "/" + START_PATH;
    private static final String BRIDGE_NAME = "FORMA_NATIVE";

    /** Matches {@code --bg} in src/styles/base.css; avoids a white first frame. */
    private static final int FORMA_BACKGROUND = Color.parseColor("#141416");

    private FrameLayout root;
    private WebView webView;

    /** A getUserMedia grant waiting on the CAMERA runtime permission. */
    @Nullable private PermissionRequest pendingCameraRequest;

    /** Written from the WebView JS thread, read from the UI thread. */
    private volatile boolean webCanGoBack = false;

    /**
     * Resolves the getUserMedia request that triggered the CAMERA prompt.
     * Kept as a field so it registers before the activity starts.
     */
    private final ActivityResultLauncher<String> cameraPermission =
            registerForActivityResult(
                    new ActivityResultContracts.RequestPermission(),
                    granted -> {
                        PermissionRequest request = pendingCameraRequest;
                        pendingCameraRequest = null;
                        if (request == null) {
                            return;
                        }
                        if (granted) {
                            request.grant(
                                    new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                        } else {
                            request.deny();
                        }
                    });

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        root = new FrameLayout(this);
        root.setBackgroundColor(FORMA_BACKGROUND);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        webView = createWebView();
        root.addView(webView);

        setContentView(root);

        applySystemBarInsets();
        applyDarkSystemBars();
        configureBackHandling();

        String startUrl = BuildConfig.USE_DEV_SERVER
                ? BuildConfig.DEV_SERVER_URL
                : BUNDLED_URL;
        Log.i(TAG, "Loading " + startUrl
                + (BuildConfig.USE_DEV_SERVER ? " (dev server)" : " (bundled assets)"));
        webView.loadUrl(startUrl);
    }

    private WebView createWebView() {
        if (BuildConfig.DEBUG) {
            // Permite inspeccionar la app con chrome://inspect en builds de debug.
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebView view = new WebView(this);
        view.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        view.setBackgroundColor(FORMA_BACKGROUND);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        // Every screen persists through localStorage.
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // Assets come from the asset loader, never from the filesystem.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        // The layout is a fixed phone frame, so system font scaling would break it.
        settings.setTextZoom(100);

        view.addJavascriptInterface(
                new WebBridge(canGoBack -> runOnUiThread(() -> webCanGoBack = canGoBack)),
                BRIDGE_NAME);
        view.setWebViewClient(createWebViewClient());
        view.setWebChromeClient(createWebChromeClient());
        return view;
    }

    private WebViewClientCompat createWebViewClient() {
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                // AssetsPathHandler opens from the assets root and hands the URL
                // path straight through, so /public/index.html resolves to
                // assets/public/index.html. A "/public/" prefix here would make
                // it look for assets/index.html instead.
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        return new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                // Returning null for anything unmatched keeps the Google Fonts
                // request on the real network.
                WebResourceResponse response =
                        assetLoader.shouldInterceptRequest(request.getUrl());
                if (response == null) {
                    return null;
                }
                if (response.getStatusCode() == 0) {
                    // AssetsPathHandler signals a missing asset by returning a
                    // response with no status and no MIME type, which Chromium
                    // reports as the opaque ERR_INVALID_RESPONSE. Turn it into
                    // a real 404 so a missing file (favicon.ico, a stale hashed
                    // bundle) shows up as what it is.
                    return notFound();
                }
                return response;
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    @NonNull WebView view, @NonNull WebResourceRequest request) {
                Uri url = request.getUrl();
                if (ASSET_HOST.equals(url.getHost()) || BuildConfig.USE_DEV_SERVER) {
                    return false;
                }
                // Anything that would leave our origin goes to the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException error) {
                    Log.w(TAG, "No handler for " + url, error);
                }
                return true;
            }
        };
    }

    private static WebResourceResponse notFound() {
        byte[] body = "Not found".getBytes(StandardCharsets.UTF_8);
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                404,
                "Not Found",
                Collections.emptyMap(),
                new ByteArrayInputStream(body));
    }

    private WebChromeClient createWebChromeClient() {
        return new WebChromeClient() {

            @Override
            public void onPermissionRequest(@NonNull PermissionRequest request) {
                boolean wantsCamera = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        wantsCamera = true;
                        break;
                    }
                }
                if (!wantsCamera) {
                    request.deny();
                    return;
                }
                // On Android, getUserMedia needs a real CAMERA grant; the
                // WebView's own prompt is not enough.
                if (ContextCompat.checkSelfPermission(
                                MainActivity.this, Manifest.permission.CAMERA)
                        == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
                    return;
                }
                pendingCameraRequest = request;
                cameraPermission.launch(Manifest.permission.CAMERA);
            }

            @Override
            public void onPermissionRequestCanceled(@NonNull PermissionRequest request) {
                if (request == pendingCameraRequest) {
                    pendingCameraRequest = null;
                }
            }

            @Override
            public boolean onConsoleMessage(@NonNull ConsoleMessage message) {
                Log.println(
                        consoleLogPriority(message.messageLevel()),
                        TAG_WEB,
                        message.message()
                                + " (" + message.sourceId() + ":"
                                + message.lineNumber() + ")");
                return true;
            }
        };
    }

    /**
     * Chromium reports console.debug/log as DEBUG/LOG, console.info as TIP and
     * console.warn as WARNING.
     */
    private static int consoleLogPriority(@NonNull ConsoleMessage.MessageLevel level) {
        switch (level) {
            case ERROR:
                return Log.ERROR;
            case WARNING:
                return Log.WARN;
            case TIP:
                return Log.INFO;
            default:
                return Log.DEBUG;
        }
    }

    /**
     * Android 15+ forces edge-to-edge for {@code targetSdk 35} and above, so the
     * window is told to lay out behind the bars and the WebView is inset by
     * padding instead. Without this the gesture bar sits on top of the app's
     * bottom navigation.
     */
    private void applySystemBarInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void applyDarkSystemBars() {
        // The web app renders on a near-black background in both of its themes.
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    private void configureBackHandling() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                Log.i(TAG, "back pressed, webCanGoBack=" + webCanGoBack);
                if (!webCanGoBack) {
                    finish();
                    return;
                }
                // __formaBack pops the web app's own route stack; routes are
                // React state rather than URLs, so it cannot be a real history
                // entry the WebView could walk on its own.
                webView.evaluateJavascript(
                        "(window.__formaBack && window.__formaBack())", null);
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
