(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});
  var SK = Quilt.STORAGE_KEYS;

  var DEFAULT_TEMPLATES = [
    {
      name: "Viral content",
      category: "Research",
      color: "#8b5cf6",
      filters: { keywords: "", minFaves: 100, minRetweets: 50, slidingWindow: "1w" },
    },
    {
      name: "Recent & popular",
      category: "Research",
      color: "#8b5cf6",
      filters: { keywords: "", minFaves: 10, slidingWindow: "1m" },
    },
    {
      name: "Video content",
      category: "Technology",
      color: "#10b981",
      filters: { keywords: "", hasVideos: true, minFaves: 20, slidingWindow: "1w" },
    },
    {
      name: "Questions only",
      category: "Research",
      color: "#8b5cf6",
      filters: { keywords: "?", includeReplies: false, slidingWindow: "1w" },
    },
    {
      name: "News articles",
      category: "Research",
      color: "#8b5cf6",
      filters: { keywords: "", hasLinks: true, slidingWindow: "1d" },
    },
    {
      name: "Your network",
      category: "Uncategorized",
      color: "#6b7280",
      filters: { keywords: "", follows: true, includeRetweets: false, slidingWindow: "1w" },
    },
    {
      name: "Verified only",
      category: "Uncategorized",
      color: "#6b7280",
      filters: { keywords: "", blueVerified: true, minFaves: 5, slidingWindow: "1w" },
    },
    {
      name: "Image posts",
      category: "Technology",
      color: "#10b981",
      filters: { keywords: "", hasImages: true, slidingWindow: "1w" },
    },
    {
      name: "Trending today",
      category: "Research",
      color: "#8b5cf6",
      filters: { keywords: "", minFaves: 50, minRetweets: 20, slidingWindow: "1d" },
    },
    {
      name: "Quote tweets",
      category: "Uncategorized",
      color: "#6b7280",
      filters: { keywords: "", quoteOnly: true, minFaves: 5, slidingWindow: "1w" },
    },
  ];

  Quilt.initSearchTemplates = function () {
    return Quilt.storageApi.get([SK.SEARCH_TEMPLATES_INIT]).then(function (r) {
      if (r[SK.SEARCH_TEMPLATES_INIT]) return;
      var QB = Quilt.QueryBuilder;
      var searches = DEFAULT_TEMPLATES.map(function (t) {
        var builder = new QB();
        builder.fromFilters(t.filters);
        return {
          id: "template_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9),
          name: t.name,
          query: builder.build(),
          filters: t.filters,
          category: t.category,
          color: t.color,
          isTemplate: true,
          isCustomColor: false,
          createdAt: new Date().toISOString(),
          useCount: 0,
          lastUsed: null,
        };
      });
      return Quilt.storageApi.get([SK.SAVED_SEARCHES]).then(function (r2) {
        var existing = r2[SK.SAVED_SEARCHES] || [];
        return Quilt.storageApi.set({
          [SK.SAVED_SEARCHES]: searches.concat(existing),
          [SK.SEARCH_TEMPLATES_INIT]: true,
        });
      });
    });
  };
})();
