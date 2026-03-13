export const runtime = "nodejs";

function jsResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store", // dev: avoid caching while iterating
    },
  });
}

export async function GET() {
  // Mantemos tudo inline (MVP). Depois podemos minificar/buildar.
  const script = `(function () {
  try {
    var CONFIG = {
      sessionCookieName: "mc_sid",
      storageKey: "mc_sid",
      sessionDays: 30,
      ingestUrl: "",
      decorateParam: "mc_sid",
      decoratedAttr: "midifyDecorated",
      sendThrottleMs: 30000,
      lastSentAtKey: "midifyLastSentAt",
      lastPayloadHashKey: "midifyLastPayloadHash",
    };
    // Always send ingestion to the same origin where this pixel is hosted.
    // This avoids posting to the LP host (e.g. localhost:8088) or file://.
    var pixelOrigin = null;
    try {
        var cs = document.currentScript;
        if (cs && cs.src) pixelOrigin = new URL(cs.src).origin;
        } catch (e) {}

    if (!pixelOrigin) {
    try {
    // Fallback: last script tag that includes /pixel.js
    var scripts = document.getElementsByTagName("script");
    for (var si = scripts.length - 1; si >= 0; si--) {
      var src = scripts[si] && scripts[si].src;
      if (src && src.indexOf("/pixel.js") !== -1) {
        pixelOrigin = new URL(src).origin;
        break;
              }
            }
        } catch (e) {}
    }

if (pixelOrigin) {
  CONFIG.ingestUrl = pixelOrigin + "/api/track/session";
}
    function now() { return Date.now(); }
    function daysToMs(d) { return d * 24 * 60 * 60 * 1000; }

    function randomId() {
      // 16 bytes hex
      var arr = new Uint8Array(16);
      (self.crypto || window.crypto).getRandomValues(arr);
      var s = "";
      for (var i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, "0");
      return "mc_" + s;
    }

    function getQueryParams() {
      var url = new URL(window.location.href);
      var p = url.searchParams;
      return {
        gclid: p.get("gclid"),
        fbclid: p.get("fbclid"),
        utmSource: p.get("utm_source"),
        utmMedium: p.get("utm_medium"),
        utmCampaign: p.get("utm_campaign"),
        utmContent: p.get("utm_content"),
        utmTerm: p.get("utm_term"),
      };
    }

    function setCookie(name, value, days) {
      var exp = new Date(now() + daysToMs(days)).toUTCString();
      document.cookie = name + "=" + encodeURIComponent(value) + "; path=/; expires=" + exp + "; SameSite=Lax";
    }

    function getCookie(name) {
      var m = document.cookie.match(new RegExp("(^| )" + name.replace(/[-[\\]{}()*+?.,\\\\^$|#\\s]/g, "\\\\$&") + "=([^;]+)"));
      return m ? decodeURIComponent(m[2]) : null;
    }

    function getOrCreateSessionId() {
      // 1) cookie
      var sid = getCookie(CONFIG.sessionCookieName);
      if (sid) return sid;

      // 2) localStorage
      try {
        sid = localStorage.getItem(CONFIG.storageKey);
        if (sid) {
          setCookie(CONFIG.sessionCookieName, sid, CONFIG.sessionDays);
          return sid;
        }
      } catch (e) {}

      // 3) create
      sid = randomId();
      setCookie(CONFIG.sessionCookieName, sid, CONFIG.sessionDays);
      try { localStorage.setItem(CONFIG.storageKey, sid); } catch (e) {}
      return sid;
    }

    function payloadHash(payload) {
      return [
        payload.sessionId || "",
        payload.gclid || "",
        payload.fbclid || "",
        payload.utmSource || "",
        payload.utmMedium || "",
        payload.utmCampaign || "",
        payload.utmContent || "",
        payload.utmTerm || "",
      ].join("|");
    }

    function shouldSendPayload(payload, force) {
      if (force) return true;

      try {
        var nowTs = Date.now();
        var lastSentAtRaw = sessionStorage.getItem(CONFIG.lastSentAtKey);
        var lastPayloadHash = sessionStorage.getItem(CONFIG.lastPayloadHashKey);
        var currentHash = payloadHash(payload);
        var lastSentAt = lastSentAtRaw ? Number(lastSentAtRaw) : 0;

        // If campaign context changed, send immediately.
        if (lastPayloadHash && lastPayloadHash !== currentHash) return true;

        // Otherwise throttle repeated sends for the same context.
        if (lastSentAt && nowTs - lastSentAt < CONFIG.sendThrottleMs) {
          return false;
        }

        return true;
      } catch (e) {
        return true;
      }
    }

    function markPayloadSent(payload) {
      try {
        sessionStorage.setItem(CONFIG.lastSentAtKey, String(Date.now()));
        sessionStorage.setItem(CONFIG.lastPayloadHashKey, payloadHash(payload));
      } catch (e) {}
    }

    function postSession(payload, force) {
      if (!CONFIG.ingestUrl) return;
      if (!shouldSendPayload(payload, !!force)) return;

      try {
        fetch(CONFIG.ingestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function(){});
        markPayloadSent(payload);
      } catch (e) {}
    }

    function beaconSession(payload) {
      if (!CONFIG.ingestUrl) return;
      if (!shouldSendPayload(payload, false)) return;

      try {
        if (navigator.sendBeacon) {
          var blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
          var ok = navigator.sendBeacon(CONFIG.ingestUrl, blob);
          if (ok) {
            markPayloadSent(payload);
            return;
          }
        }
      } catch (e) {}

      postSession(payload, true);
    }

    function shouldDecorateLink(a) {
      if (!a || a.tagName !== "A") return false;

      var explicit = a.getAttribute("data-midify-track");
      if (explicit === "true") return true;

      var href = a.getAttribute("href");
      if (!href) return false;

      try {
        var url = new URL(href, window.location.origin);
        return url.pathname.indexOf("/track/") !== -1;
      } catch (e) {
        return false;
      }
    }

    function decorateTrackLinks(sessionId) {
      var anchors = document.querySelectorAll("a");
      for (var i = 0; i < anchors.length; i++) {
        try {
          var a = anchors[i];
          if (!shouldDecorateLink(a)) continue;

          var href = a.getAttribute("href");
          if (!href) continue;

          var url = new URL(href, window.location.origin);
          var currentSid = url.searchParams.get(CONFIG.decorateParam);
          var alreadyDecorated = a.getAttribute("data-midify-decorated") === "1";

          // If this exact anchor is already decorated with the same session id, skip.
          if (alreadyDecorated && currentSid === sessionId) continue;

          // Always normalize to the current session id, but never duplicate the param.
          url.searchParams.set(CONFIG.decorateParam, sessionId);

          a.setAttribute("href", url.toString());
          a.setAttribute("data-midify-decorated", "1");
        } catch (e) {}
      }
    }

    var sessionId = getOrCreateSessionId();
    var qp = getQueryParams();

    function buildPayload() {
      return {
        sessionId: sessionId,
        gclid: qp.gclid,
        fbclid: qp.fbclid,
        utmSource: qp.utmSource,
        utmMedium: qp.utmMedium,
        utmCampaign: qp.utmCampaign,
        utmContent: qp.utmContent,
        utmTerm: qp.utmTerm,
        userAgent: navigator.userAgent,
      };
    }

    var payload = buildPayload();
    postSession(payload, false);

    // decora no load
    decorateTrackLinks(sessionId);

    // decora também se o site trocar conteúdo dinamicamente
    try {
      var obs = new MutationObserver(function () {
        decorateTrackLinks(sessionId);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    try {
      window.addEventListener("pagehide", function () {
        beaconSession(buildPayload());
      });
    } catch (e) {}
  } catch (e) {
    // silencioso por padrão
  }
})();`;

  return jsResponse(script);
}