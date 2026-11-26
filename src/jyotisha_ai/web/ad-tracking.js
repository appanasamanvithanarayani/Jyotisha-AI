(function () {
  'use strict';

  let attempts = 0;

  function report(format, event) {
    fetch('/api/ad-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, event }),
      keepalive: true,
    }).catch(function () { /* Analytics must never interrupt the ad flow. */ });
  }

  function setup() {
    const capacitor = window.Capacitor;
    const adMob = capacitor && capacitor.Plugins && capacitor.Plugins.AdMob;
    if (!adMob) {
      if (attempts++ < 20) window.setTimeout(setup, 250);
      return;
    }
    if (adMob.__jyotishaTracking) return;
    adMob.__jyotishaTracking = true;

    function trackRequest(method, format) {
      const original = adMob[method];
      if (typeof original !== 'function') return;
      adMob[method] = function () {
        report(format, 'requested');
        return original.apply(this, arguments);
      };
    }

    trackRequest('showBanner', 'banner');
    trackRequest('showInterstitial', 'interstitial');
    trackRequest('showRewardVideoAd', 'rewarded');

    const callbacks = {
      bannerAdLoaded: ['banner', 'shown'],
      bannerAdFailedToLoad: ['banner', 'failed'],
      interstitialAdShowed: ['interstitial', 'shown'],
      interstitialAdFailedToLoad: ['interstitial', 'failed'],
      interstitialAdFailedToShow: ['interstitial', 'failed'],
      interstitialAdDismissed: ['interstitial', 'dismissed'],
      onRewardedVideoAdShowed: ['rewarded', 'shown'],
      onRewardedVideoAdFailedToLoad: ['rewarded', 'failed'],
      onRewardedVideoAdFailedToShow: ['rewarded', 'failed'],
      onRewardedVideoAdReward: ['rewarded', 'rewarded'],
      onRewardedVideoAdDismissed: ['rewarded', 'dismissed'],
    };
    if (typeof adMob.addListener === 'function') {
      Object.entries(callbacks).forEach(function (entry) {
        const name = entry[0], signal = entry[1];
        try { adMob.addListener(name, function () { report(signal[0], signal[1]); }); }
        catch (_error) { /* Older plugin versions may omit individual callbacks. */ }
      });
    }
  }

  setup();
})();
