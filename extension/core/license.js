(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});
  var SK = Quilt.STORAGE_KEYS;

  /* NOTE: Validate logic is duplicated in background/background.js for the
     service worker context (no window.Quilt). Keep both in sync. */
  var LS_API = "https://api.lemonsqueezy.com/v1/licenses";
  var REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
  var OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

  Quilt.PRODUCT_IDS = { monthly: "910733", lifetime: "910739" };
  Quilt.CHECKOUT_URLS = {
    monthly:  "https://quiltt.lemonsqueezy.com/checkout/buy/9906cca8-eab2-4ab3-80b5-b620d87ad9f7",
    lifetime: "https://quiltt.lemonsqueezy.com/checkout/buy/98ee024d-a7a5-4a5a-a5f7-2c7ec7fea1a3",
  };

  var _cached = null;

  function lsPost(endpoint, body) {
    return fetch(LS_API + "/" + endpoint, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: Object.keys(body).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(body[k]);
      }).join("&"),
    }).then(function (r) { return r.json(); });
  }

  function getDeviceId() {
    return Quilt.storageApi.get([SK.DEVICE_ID]).then(function (r) {
      if (r[SK.DEVICE_ID]) return r[SK.DEVICE_ID];
      var id = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 12);
      return Quilt.storageApi.set({ [SK.DEVICE_ID]: id }).then(function () { return id; });
    });
  }

  function loadCached() {
    if (_cached) return Promise.resolve(_cached);
    return Quilt.storageApi.get([SK.LICENSE]).then(function (r) {
      _cached = r[SK.LICENSE] || null;
      return _cached;
    });
  }

  function saveLicense(data) {
    _cached = data;
    return Quilt.storageApi.set({ [SK.LICENSE]: data });
  }

  function clearLicense() {
    _cached = null;
    return Quilt.storageApi.set({ [SK.LICENSE]: null });
  }

  function deriveTier(licenseData) {
    if (!licenseData) return "free";
    var status = licenseData.status;
    if (status !== "active") return "free";
    var validated = Math.min(licenseData.validatedAt || 0, Date.now());
    if (Date.now() - validated > OFFLINE_GRACE_MS) return "free";
    return "premium";
  }

  var LicenseApi = {
    activate: function (key) {
      return getDeviceId().then(function (deviceId) {
        return lsPost("activate", {
          license_key: key,
          instance_name: deviceId,
        });
      }).then(function (res) {
        if (res.activated || (res.valid && res.license_key)) {
          var meta = res.license_key || {};
          var inst = res.instance || {};
          var data = {
            key: key,
            instanceId: inst.id || "",
            tier: "premium",
            status: meta.status || "active",
            variant: (meta.activation_usage || 0) > 0 ? "subscription" : "lifetime",
            validatedAt: Date.now(),
            customerEmail: meta.customer_email || "",
          };
          return saveLicense(data).then(function () {
            return { ok: true, tier: "premium", data: data };
          });
        }
        return { ok: false, error: res.error || "activation_failed" };
      }).catch(function (e) {
        return { ok: false, error: String(e.message || e) };
      });
    },

    deactivate: function () {
      return loadCached().then(function (lic) {
        if (!lic || !lic.key) return clearLicense().then(function () { return { ok: true }; });
        var body = { license_key: lic.key };
        if (lic.instanceId) body.instance_id = lic.instanceId;
        return lsPost("deactivate", body).then(function () {
          return clearLicense().then(function () { return { ok: true }; });
        }).catch(function () {
          return clearLicense().then(function () { return { ok: true }; });
        });
      });
    },

    validate: function () {
      return loadCached().then(function (lic) {
        if (!lic || !lic.key) return { ok: true, tier: "free" };
        return lsPost("validate", {
          license_key: lic.key,
          instance_id: lic.instanceId || "",
        }).then(function (res) {
          if (res.valid) {
            var meta = res.license_key || {};
            lic.status = meta.status || "active";
            lic.tier = meta.status === "active" ? "premium" : "free";
            lic.validatedAt = Date.now();
            if (meta.customer_email) lic.customerEmail = meta.customer_email;
            return saveLicense(lic).then(function () {
              return { ok: true, tier: lic.tier };
            });
          }
          lic.status = "expired";
          lic.tier = "free";
          return saveLicense(lic).then(function () {
            return { ok: true, tier: "free" };
          });
        }).catch(function () {
          return { ok: true, tier: deriveTier(lic) };
        });
      });
    },

    getTier: function () {
      return loadCached().then(function (lic) {
        return deriveTier(lic);
      });
    },

    getTierSync: function () {
      return deriveTier(_cached);
    },

    getLimits: function (taskType) {
      return LicenseApi.getTier().then(function (tier) {
        var limits = Quilt.TIER_LIMITS[tier] || Quilt.TIER_LIMITS.free;
        return limits[taskType] || { maxPerRun: null, maxPerDay: null };
      });
    },

    getLicenseInfo: function () {
      return loadCached();
    },

    needsRevalidation: function () {
      return loadCached().then(function (lic) {
        if (!lic || !lic.key) return false;
        return Date.now() - (lic.validatedAt || 0) > REVALIDATE_INTERVAL_MS;
      });
    },

    maybeRevalidate: function () {
      return LicenseApi.needsRevalidation().then(function (needed) {
        if (needed) return LicenseApi.validate();
        return LicenseApi.getTier().then(function (tier) { return { ok: true, tier: tier }; });
      });
    },
  };

  Quilt.licenseApi = LicenseApi;
})();
