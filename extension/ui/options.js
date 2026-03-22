(function () {
  "use strict";

  var Quilt = self.Quilt;
  var SK = Quilt.STORAGE_KEYS;

  var cbDebug = document.getElementById("debug");
  var cbSidebar = document.getElementById("sidebar");

  chrome.storage.local.get([SK.DEBUG_ENABLED, SK.SIDEBAR_ON_CLICK], function (r) {
    cbDebug.checked = !!r[SK.DEBUG_ENABLED];
    cbSidebar.checked = r[SK.SIDEBAR_ON_CLICK] !== false;
  });

  cbDebug.addEventListener("change", function () {
    chrome.storage.local.set({ [SK.DEBUG_ENABLED]: cbDebug.checked });
  });

  cbSidebar.addEventListener("change", function () {
    chrome.storage.local.set({ [SK.SIDEBAR_ON_CLICK]: cbSidebar.checked });
  });

  /* ── License management ── */

  var elDot = document.getElementById("licenseDot");
  var elTier = document.getElementById("licenseTier");
  var elDetail = document.getElementById("licenseDetail");
  var elActivateRow = document.getElementById("licenseActivateRow");
  var elDeactivateRow = document.getElementById("licenseDeactivateRow");
  var elKeyInput = document.getElementById("licenseKeyInput");
  var btnActivate = document.getElementById("btnActivate");
  var btnDeactivate = document.getElementById("btnDeactivate");
  var elMsg = document.getElementById("licenseMsg");
  var elMonthly = document.getElementById("linkMonthly");
  var elLifetime = document.getElementById("linkLifetime");
  var elUpgradeRow = document.getElementById("upgradeLinks");

  if (Quilt.CHECKOUT_URLS) {
    if (elMonthly) elMonthly.href = Quilt.CHECKOUT_URLS.monthly;
    if (elLifetime) elLifetime.href = Quilt.CHECKOUT_URLS.lifetime;
  }

  function setMsg(text, type) {
    elMsg.textContent = text;
    elMsg.className = "license-msg" + (type ? " " + type : "");
  }

  function renderLicenseState(lic) {
    if (lic && lic.tier === "premium" && lic.status === "active") {
      elDot.className = "license-dot premium";
      var label = lic.variant === "subscription" ? "Premium (Subscription)" : "Premium (Lifetime)";
      elTier.textContent = label;
      elDetail.textContent = lic.customerEmail ? lic.customerEmail : "";
      elActivateRow.style.display = "none";
      elDeactivateRow.style.display = "flex";
      if (elUpgradeRow) elUpgradeRow.style.display = "none";
    } else {
      elDot.className = "license-dot free";
      elTier.textContent = "Free";
      elDetail.textContent = lic && lic.status === "expired" ? "(expired)" : "";
      elActivateRow.style.display = "flex";
      elDeactivateRow.style.display = "none";
      if (elUpgradeRow) elUpgradeRow.style.display = "flex";
    }
  }

  if (Quilt.licenseApi) {
    Quilt.licenseApi.getLicenseInfo().then(renderLicenseState);
  }

  btnActivate.addEventListener("click", function () {
    var key = (elKeyInput.value || "").trim();
    if (!key) { setMsg("Please enter an activation code", "error"); return; }
    btnActivate.disabled = true;
    setMsg("Activating...");
    Quilt.licenseApi.activate(key).then(function (res) {
      btnActivate.disabled = false;
      if (res.ok) {
        setMsg("Activated!", "success");
        elKeyInput.value = "";
        renderLicenseState(res.data);
      } else {
        setMsg(res.error || "Activation failed", "error");
      }
    });
  });

  btnDeactivate.addEventListener("click", function () {
    btnDeactivate.disabled = true;
    setMsg("Deactivating...");
    Quilt.licenseApi.deactivate().then(function () {
      btnDeactivate.disabled = false;
      setMsg("Deactivated", "");
      renderLicenseState(null);
    });
  });
})();
