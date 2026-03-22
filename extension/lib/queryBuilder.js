(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});

  var EMPTY_FILTERS = {
    keywords: "",
    minFaves: null,
    maxFaves: null,
    minRetweets: null,
    maxRetweets: null,
    minReplies: null,
    maxReplies: null,
    slidingWindow: null,
    sinceDate: null,
    untilDate: null,
    fromUser: null,
    toUser: null,
    mentionsUser: null,
    blueVerified: false,
    follows: false,
    hasMedia: false,
    hasImages: false,
    hasVideos: false,
    hasLinks: false,
    includeReplies: null,
    includeRetweets: null,
    quoteOnly: false,
    lang: null,
  };

  function QueryBuilder() {
    this.filters = {};
    for (var k in EMPTY_FILTERS) {
      if (Object.prototype.hasOwnProperty.call(EMPTY_FILTERS, k)) {
        this.filters[k] = EMPTY_FILTERS[k];
      }
    }
  }

  QueryBuilder.prototype.fromFilters = function (f) {
    if (!f || typeof f !== "object") return this;
    for (var k in f) {
      if (Object.prototype.hasOwnProperty.call(f, k) &&
          Object.prototype.hasOwnProperty.call(this.filters, k)) {
        this.filters[k] = f[k];
      }
    }
    return this;
  };

  QueryBuilder.prototype.reset = function () {
    for (var k in EMPTY_FILTERS) {
      if (Object.prototype.hasOwnProperty.call(EMPTY_FILTERS, k)) {
        this.filters[k] = EMPTY_FILTERS[k];
      }
    }
    return this;
  };

  QueryBuilder.prototype.calculateSlidingDates = function () {
    if (!this.filters.slidingWindow) {
      return { sinceDate: this.filters.sinceDate, untilDate: this.filters.untilDate };
    }
    var today = new Date();
    var until = today.toISOString().split("T")[0];
    var ref = new Date(today);
    switch (this.filters.slidingWindow) {
      case "1d":
        ref.setDate(ref.getDate() - 1);
        break;
      case "1w":
        ref.setDate(ref.getDate() - 7);
        break;
      case "1m":
        ref.setMonth(ref.getMonth() - 1);
        break;
      default:
        return { sinceDate: this.filters.sinceDate, untilDate: this.filters.untilDate };
    }
    return { sinceDate: ref.toISOString().split("T")[0], untilDate: until };
  };

  QueryBuilder.prototype.build = function () {
    var f = this.filters;
    var parts = [];

    if (f.keywords) {
      var kw = f.keywords;
      var needsQuotes = kw.indexOf(" ") !== -1 && kw.charAt(0) !== '"';
      parts.push(needsQuotes ? '"' + kw + '"' : kw);
    }

    if (f.minFaves !== null && f.minFaves !== "") parts.push("min_faves:" + f.minFaves);
    if (f.maxFaves !== null && f.maxFaves !== "") parts.push("-min_faves:" + f.maxFaves);
    if (f.minRetweets !== null && f.minRetweets !== "") parts.push("min_retweets:" + f.minRetweets);
    if (f.maxRetweets !== null && f.maxRetweets !== "") parts.push("-min_retweets:" + f.maxRetweets);
    if (f.minReplies !== null && f.minReplies !== "") parts.push("min_replies:" + f.minReplies);
    if (f.maxReplies !== null && f.maxReplies !== "") parts.push("-min_replies:" + f.maxReplies);

    var dates = this.calculateSlidingDates();
    if (dates.sinceDate) parts.push("since:" + dates.sinceDate);
    if (dates.untilDate) parts.push("until:" + dates.untilDate);

    if (f.fromUser) parts.push("from:" + f.fromUser);
    if (f.toUser) parts.push("to:" + f.toUser);
    if (f.mentionsUser) parts.push("@" + f.mentionsUser);

    if (f.blueVerified) parts.push("filter:blue_verified");
    if (f.follows) parts.push("filter:follows");
    if (f.hasMedia) parts.push("filter:media");
    if (f.hasImages) parts.push("filter:images");
    if (f.hasVideos) parts.push("filter:videos");
    if (f.hasLinks) parts.push("filter:links");

    if (f.includeReplies === false) parts.push("-filter:replies");
    else if (f.includeReplies === true) parts.push("filter:replies");

    if (f.includeRetweets === false) parts.push("-filter:retweets");
    else if (f.includeRetweets === true) parts.push("filter:retweets");

    if (f.quoteOnly) parts.push("filter:quote");
    if (f.lang) parts.push("lang:" + f.lang);

    return parts.join(" ");
  };

  QueryBuilder.EMPTY_FILTERS = EMPTY_FILTERS;

  Quilt.QueryBuilder = QueryBuilder;
})();
