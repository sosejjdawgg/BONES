package com.sosejjdawgg.bones;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/* The whole game is assets/index.html. This activity is only the frame around it: full screen,
   portrait, the screen kept awake while it is up, and the WebView set up the way the game needs -
   JavaScript, localStorage for SAVE GAME, music that may start without a fresh tap, and the
   browser's own alert/prompt dialogs (naming the puppy uses prompt()). */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                 // localStorage: where SAVE GAME writes
        s.setMediaPlaybackRequiresUserGesture(false);  // the soundtracks start on their own cues
        s.setAllowFileAccess(true);
        s.setTextZoom(100);                           // a phone's font-size setting must not resize a pixel UI
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        web.setWebChromeClient(new WebChromeClient()); // gives alert/confirm/prompt their default dialogs
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !"file".equals(r.getUrl().getScheme());   // nothing leaves the app
            }
        });
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);
        immersive();
        web.loadUrl("file:///android_asset/index.html");
    }

    // bars hidden, and a swipe from the edge brings them back only for a moment
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
              | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
              | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) immersive();
    }

    // backgrounded: the page sees document.hidden, so the music stops and the clocks stop with it
    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        web.pauseTimers();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        immersive();
    }

    /* The game only saves when you press SAVE GAME (and after a herding shift), so BACK asks before
       it closes anything rather than throwing away a session with one stray thumb. */
    @Override
    public void onBackPressed() {
        new AlertDialog.Builder(this)
            .setTitle("LEAVE BONES?")
            .setMessage("Anything since your last SAVE GAME will be lost.")
            .setPositiveButton("LEAVE", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface d, int w) { finish(); }
            })
            .setNegativeButton("STAY", null)
            .show();
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
