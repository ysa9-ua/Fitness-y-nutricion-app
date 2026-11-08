package com.forma.app;

import android.webkit.JavascriptInterface;

/**
 * Synchronous channel from the web app into the native shell.
 *
 * <p>Methods annotated with {@link JavascriptInterface} are invoked on the
 * WebView's JavaScript thread, not the UI thread, so implementations must not
 * touch the view hierarchy directly. {@link MainActivity} owns the callbacks
 * and is responsible for hopping to the UI thread.
 *
 * <p>Only our own bundled assets are ever loaded into the WebView, so exposing
 * this bridge does not hand the object to untrusted content.
 */
public final class WebBridge {

    /** Receives the decisions the web app cannot make on its own. */
    public interface Listener {
        /**
         * The web app changed whether it has an in-app screen to go back to.
         * The native shell has to know this before handling a key event,
         * because there is no synchronous way to ask JavaScript from Java.
         */
        void onCanGoBackChanged(boolean canGoBack);
    }

    private final Listener listener;

    public WebBridge(Listener listener) {
        this.listener = listener;
    }

    @JavascriptInterface
    public void setCanGoBack(boolean canGoBack) {
        listener.onCanGoBackChanged(canGoBack);
    }
}
