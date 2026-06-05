/*
 * Velo PAGE code for the Wix "/verify" page.
 *
 * Paste this into the code panel of the /verify page (the per-page file, e.g.
 * "verify.js" in the Velo sidebar — NOT the site-wide masterPage.js).
 *
 * It reads ?v=<token> from the URL, asks the backend to verify it, and hands the
 * result to the HTML embed (wix/verify.html). Give the embed the ID #verifyHtml
 * (select the HTML element → Properties → set ID), or change ID below.
 *
 * QR codes encode:  https://levels.ge/verify?v=<token>
 */
import wixLocation from 'wix-location';

$w.onReady(function () {
  var token = (wixLocation.query && (wixLocation.query.v || wixLocation.query.id) || '').trim();
  var html = $w('#verifyHtml');

  function send(result) {
    html.postMessage({ source: 'levels-verify', token: token, result: result });
  }

  // Re-send when the embed announces it's ready (covers load-order races).
  html.onMessage(function (event) {
    if (event.data && event.data.ready) deliver();
  });

  var delivered = null;
  function deliver() {
    if (delivered !== null) { send(delivered); return; }
    if (!token) { delivered = { found: false }; send(delivered); return; }
    fetch('https://www.levels.ge/_functions/verify?v=' + encodeURIComponent(token), { method: 'get' })
      .then(function (r) { return r.json(); })
      .then(function (data) { delivered = data; send(delivered); })
      .catch(function () { delivered = { error: true }; send(delivered); });
  }

  deliver();
});
