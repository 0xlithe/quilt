(function () {
  "use strict";

  var Quilt = (window.Quilt = window.Quilt || {});
  var SK = Quilt.STORAGE_KEYS;

  function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return "search_" + crypto.randomUUID();
    }
    return "search_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  var SearchStorage = {
    getSavedSearches: function () {
      return Quilt.storageApi.get([SK.SAVED_SEARCHES]).then(function (r) {
        return r[SK.SAVED_SEARCHES] || [];
      });
    },

    saveSearch: function (search) {
      var self = this;
      return self.getSavedSearches().then(function (searches) {
        var cat = search.category || "Uncategorized";
        return self.getCategoryColor(cat).then(function (catColor) {
          var newSearch = {
            id: generateId(),
            name: search.name,
            query: search.query,
            filters: search.filters,
            category: cat,
            color: search.color || catColor,
            isCustomColor: !!search.color,
            createdAt: new Date().toISOString(),
            useCount: 0,
            lastUsed: null,
          };
          searches.unshift(newSearch);
          return Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }).then(function () {
            return newSearch;
          });
        });
      });
    },

    updateSearch: function (id, updates) {
      return this.getSavedSearches().then(function (searches) {
        var idx = -1;
        for (var i = 0; i < searches.length; i++) {
          if (searches[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return null;
        for (var k in updates) {
          if (Object.prototype.hasOwnProperty.call(updates, k)) {
            searches[idx][k] = updates[k];
          }
        }
        return Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }).then(function () {
          return searches[idx];
        });
      });
    },

    deleteSearch: function (id) {
      return this.getSavedSearches().then(function (searches) {
        var filtered = searches.filter(function (s) { return s.id !== id; });
        return Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: filtered });
      });
    },

    reorderSearches: function (orderedIds) {
      return this.getSavedSearches().then(function (searches) {
        var map = {};
        var seen = {};
        for (var i = 0; i < searches.length; i++) map[searches[i].id] = searches[i];
        var reordered = [];
        for (var j = 0; j < orderedIds.length; j++) {
          if (map[orderedIds[j]]) {
            reordered.push(map[orderedIds[j]]);
            seen[orderedIds[j]] = true;
          }
        }
        for (var k = 0; k < searches.length; k++) {
          if (!seen[searches[k].id]) reordered.push(searches[k]);
        }
        return Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: reordered }).then(function () {
          return reordered;
        });
      });
    },

    incrementUseCount: function (id) {
      return this.getSavedSearches().then(function (searches) {
        for (var i = 0; i < searches.length; i++) {
          if (searches[i].id === id) {
            searches[i].useCount = (searches[i].useCount || 0) + 1;
            searches[i].lastUsed = new Date().toISOString();
            return Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }).then(function () {
              return searches[i];
            });
          }
        }
        return null;
      });
    },

    getCategories: function () {
      return Quilt.storageApi.get([SK.SEARCH_CATEGORIES]).then(function (r) {
        return r[SK.SEARCH_CATEGORIES] || ["Coding", "Technology", "Research", "Uncategorized"];
      });
    },

    createCategory: function (name, color) {
      color = color || "#6b7280";
      var trimmed = (name || "").trim();
      if (!trimmed) return Promise.reject(new Error("Category name cannot be empty"));
      var self = this;
      return self.getCategories().then(function (cats) {
        if (cats.indexOf(trimmed) !== -1) return Promise.reject(new Error("Category already exists"));
        cats.unshift(trimmed);
        return Quilt.storageApi.set({ [SK.SEARCH_CATEGORIES]: cats }).then(function () {
          return self.setCategoryColor(trimmed, color).then(function () {
            return { name: trimmed, color: color };
          });
        });
      });
    },

    renameCategory: function (oldName, newName) {
      var trimmed = (newName || "").trim();
      if (!trimmed) return Promise.reject(new Error("Name cannot be empty"));
      if (oldName === trimmed) return Promise.resolve({ renamed: false });
      var self = this;
      return self.getCategories().then(function (cats) {
        if (cats.indexOf(oldName) === -1) return Promise.reject(new Error("Category not found"));
        if (cats.indexOf(trimmed) !== -1) return Promise.reject(new Error("Name already exists"));
        var updated = cats.map(function (c) { return c === oldName ? trimmed : c; });
        return Quilt.storageApi.set({ [SK.SEARCH_CATEGORIES]: updated }).then(function () {
          return self.getSavedSearches().then(function (searches) {
            var changed = false;
            searches.forEach(function (s) { if (s.category === oldName) { s.category = trimmed; changed = true; } });
            var p = changed ? Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }) : Promise.resolve();
            return p.then(function () {
              return self.getCategoryColors().then(function (colors) {
                if (colors[oldName]) { colors[trimmed] = colors[oldName]; delete colors[oldName]; }
                return Quilt.storageApi.set({ [SK.SEARCH_CATEGORY_COLORS]: colors });
              });
            });
          });
        });
      });
    },

    deleteCategory: function (name) {
      if (name === "Uncategorized") return Promise.reject(new Error("Cannot delete Uncategorized"));
      var self = this;
      return self.getCategories().then(function (cats) {
        var filtered = cats.filter(function (c) { return c !== name; });
        if (filtered.length === cats.length) return { deleted: false, searchesMoved: 0 };
        return Quilt.storageApi.set({ [SK.SEARCH_CATEGORIES]: filtered }).then(function () {
          return self.getCategoryColor("Uncategorized").then(function (uncatColor) {
            return self.getSavedSearches().then(function (searches) {
              var moved = 0;
              searches.forEach(function (s) {
                if (s.category === name) {
                  s.category = "Uncategorized";
                  if (!s.isCustomColor) s.color = uncatColor;
                  moved++;
                }
              });
              var p = moved > 0 ? Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }) : Promise.resolve();
              return p.then(function () {
                return self.getCategoryColors().then(function (colors) {
                  delete colors[name];
                  return Quilt.storageApi.set({ [SK.SEARCH_CATEGORY_COLORS]: colors }).then(function () {
                    return { deleted: true, searchesMoved: moved };
                  });
                });
              });
            });
          });
        });
      });
    },

    getCategoryColors: function () {
      return Quilt.storageApi.get([SK.SEARCH_CATEGORY_COLORS]).then(function (r) {
        return r[SK.SEARCH_CATEGORY_COLORS] || {
          Coding: "#3b82f6",
          Technology: "#10b981",
          Research: "#8b5cf6",
          Uncategorized: "#6b7280",
        };
      });
    },

    setCategoryColor: function (cat, color) {
      var self = this;
      return self.getCategoryColors().then(function (colors) {
        colors[cat] = color;
        return Quilt.storageApi.set({ [SK.SEARCH_CATEGORY_COLORS]: colors });
      });
    },

    getCategoryColor: function (cat) {
      return this.getCategoryColors().then(function (colors) {
        return colors[cat] || "#6b7280";
      });
    },

    updateSearchesInCategory: function (cat, newColor) {
      return this.getSavedSearches().then(function (searches) {
        var changed = false;
        searches.forEach(function (s) {
          if (s.category === cat && !s.isCustomColor) { s.color = newColor; changed = true; }
        });
        return changed ? Quilt.storageApi.set({ [SK.SAVED_SEARCHES]: searches }) : Promise.resolve();
      });
    },
  };

  Quilt.searchStorage = SearchStorage;
})();
