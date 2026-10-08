// App version and the data schema this page understands. Classic script and CommonJS.
(function (root) {
  "use strict";
  var api = { APP_VERSION: "0.1.0", SUPPORTED_SCHEMA: 1, DATASET: "forever" };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.FGP = root.FGP || {}; root.FGP.version = api; }
})(this);
