package com.workcelltec.vortex;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Casca fina do Painel Vortex: abre o painel (PWA hospedado no GitHub Pages)
 * em tela cheia, sem depender do Chrome. Toda atualização do painel chega
 * sozinha, sem gerar APK novo.
 */
public class MainActivity extends Activity {

    private static final String URL = "https://workcelltec.github.io/valores_envelope/";
    private static final String HOST = "workcelltec.github.io";
    private static final int REQ_ARQUIVO = 7;

    private WebView web;
    private ValueCallback<Uri[]> escolhaArquivo;

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);

        web = new WebView(this);
        web.setBackgroundColor(0xFF0E3B2E);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignorar) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) mostrarSemConexao();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (escolhaArquivo != null) escolhaArquivo.onReceiveValue(null);
                escolhaArquivo = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_ARQUIVO);
                } catch (Exception ex) {
                    escolhaArquivo = null;
                    return false;
                }
                return true;
            }
        });

        if (estado != null) web.restoreState(estado);
        else web.loadUrl(URL);
    }

    private void mostrarSemConexao() {
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;background:#0E3B2E;color:#fff;font-family:sans-serif;"
                + "display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center'>"
                + "<div style='padding:24px'><h2>Sem conexão</h2>"
                + "<p style='opacity:.8'>Não consegui abrir o painel. Confira a internet.</p>"
                + "<a href='" + URL + "' style='display:inline-block;margin-top:12px;padding:14px 28px;"
                + "border-radius:14px;background:#C8F169;color:#0E3B2E;font-weight:700;text-decoration:none'>"
                + "Tentar de novo</a></div></body></html>";
        web.loadDataWithBaseURL(URL, html, "text/html", "UTF-8", null);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent dados) {
        if (req == REQ_ARQUIVO) {
            if (escolhaArquivo != null) {
                escolhaArquivo.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, dados));
                escolhaArquivo = null;
            }
            return;
        }
        super.onActivityResult(req, res, dados);
    }

    @Override
    protected void onSaveInstanceState(Bundle saida) {
        super.onSaveInstanceState(saida);
        web.saveState(saida);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            web.destroy();
        }
        super.onDestroy();
    }
}
