(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  function applySearchToPage(query) {
    var searchInput =
      document.querySelector('input[data-testid="SearchBox_Search_Input"]') ||
      document.querySelector('input[aria-label="Search query"]') ||
      document.querySelector('input[placeholder*="Search"]');

    if (searchInput) {
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new Event("change", { bubbles: true }));

      var currentUrl = window.location.href;
      setTimeout(function () {
        var form = searchInput.closest("form");
        if (form) {
          form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        } else {
          searchInput.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true,
          }));
        }
        setTimeout(function () {
          if (window.location.href === currentUrl) {
            window.location.href = "https://x.com/search?q=" + encodeURIComponent(query) + "&src=typed_query";
          }
        }, 500);
      }, 100);
    } else {
      window.location.href = "https://x.com/search?q=" + encodeURIComponent(query) + "&src=typed_query";
    }
  }

  Quilt.applySearchToPage = applySearchToPage;
})();
