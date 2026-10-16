  (function () {
    // Prevent double-init if this script is evaluated more than once
    if (window.__xrayPlaceholderInit) return;
    window.__xrayPlaceholderInit = true;

    var examples = ['yourbusiness.com', 'yourstartup.io', 'yourstore.com', 'yourportfolio.dev'];
    var input = document.getElementById('url-input');
    if (!input) return;

    var exIndex = 0;
    var charIndex = 0;
    var deleting = false;

    function clearTimer() {
      if (window.__xrayPlaceholderTimer != null) {
        clearTimeout(window.__xrayPlaceholderTimer);
        window.__xrayPlaceholderTimer = null;
      }
    }

    function schedule(fn, ms) {
      clearTimer();
      window.__xrayPlaceholderTimer = setTimeout(fn, ms);
    }

    function tick() {
      // Pause while user has typed a real value
      if (input.value && input.value.length > 0) {
        schedule(tick, 400);
        return;
      }

      var word = examples[exIndex];
      if (!deleting) {
        charIndex++;
        input.placeholder = word.slice(0, charIndex);
        if (charIndex === word.length) {
          deleting = true;
          schedule(tick, 1400);
          return;
        }
      } else {
        charIndex--;
        input.placeholder = word.slice(0, charIndex);
        if (charIndex === 0) {
          deleting = false;
          exIndex = (exIndex + 1) % examples.length;
        }
      }
      schedule(tick, deleting ? 40 : 80);
    }

    // Always clear any leftover timer before starting (bfcache / re-entry)
    clearTimer();
    tick();

    // Pages restored from back-forward cache re-fire pageshow
    window.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        clearTimer();
        deleting = false;
        charIndex = 0;
        tick();
      }
    });
  })();
