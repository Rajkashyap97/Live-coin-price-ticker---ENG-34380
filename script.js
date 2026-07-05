(function(){
  "use strict";

  var API_URL = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h";
  var REFRESH_MS = 30000;
  var FETCH_TIMEOUT_MS = 9000; // guards against spotty / slow 3G connections

  var state = {
    coins: [],
    filtered: [],
    query: "",
    sortKey: "market_cap",
    sortDir: "desc",
    status: "loading", // loading | ready | error | empty
    errorMessage: ""
  };

  var els = {
    tableBody: document.getElementById("tableBody"),
    searchInput: document.getElementById("searchInput"),
    searchError: document.getElementById("searchError"),
    rowCountMeta: document.getElementById("rowCountMeta"),
    refreshBtn: document.getElementById("refreshBtn"),
    connPill: document.getElementById("connPill"),
    connLabel: document.getElementById("connLabel"),
    lastUpdated: document.getElementById("lastUpdated"),
    tapeTrack: document.getElementById("tapeTrack")
  };

  var refreshTimer = null;

  /* ---------------- Analytics (simulated telemetry) ---------------- */
  function trackEvent(action, detail){
    console.log("[Analytics] User interacted with Live Coin Price Ticker", {
      action: action,
      detail: detail || null,
      timestamp: new Date().toISOString()
    });
  }

  /* ---------------- Security: sanitize free-text input ---------------- */
  // Strips HTML-significant characters before the value is ever stored in
  // state or used to build a query, preventing stored/reflected XSS.
  function sanitizeText(raw){
    return String(raw)
      .replace(/[<>"'`]/g, "")
      .replace(/javascript:/gi, "")
      .slice(0, 40);
  }

  function escapeHtml(str){
    var div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  /* ---------------- Formatting helpers ---------------- */
  function formatUsd(n){
    if (typeof n !== "number" || isNaN(n)) return "—";
    if (n < 1){
      return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    }
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatCompactUsd(n){
    if (typeof n !== "number" || isNaN(n)) return "—";
    return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }

  function formatPct(n){
    if (typeof n !== "number" || isNaN(n)) return "0.00%";
    var sign = n > 0 ? "+" : "";
    return sign + n.toFixed(2) + "%";
  }

  /* ---------------- Connection status pill ---------------- */
  function setConnState(mode, label){
    els.connPill.setAttribute("data-state", mode);
    els.connLabel.textContent = label;
  }

  window.addEventListener("online", function(){
    setConnState("online", "Browser online");
  });
  window.addEventListener("offline", function(){
    setConnState("offline", "Browser offline");
  });

  /* ---------------- Fetch with timeout (spotty connection guard) ---------------- */
  function fetchWithTimeout(url, timeoutMs){
    var controller = new AbortController();
    var timer = setTimeout(function(){ controller.abort(); }, timeoutMs);
    return fetch(url, { signal: controller.signal })
      .finally(function(){ clearTimeout(timer); });
  }

  async function loadCoins(isManualRefresh){
    state.status = "loading";
    render();
    setConnState("checking", isManualRefresh ? "Refreshing…" : "Checking connection…");
    els.refreshBtn.disabled = true;

    try{
      var response = await fetchWithTimeout(API_URL, FETCH_TIMEOUT_MS);

      if (!response.ok){
        throw new Error("Server responded with status " + response.status);
      }

      var data;
      try{
        data = await response.json();
      } catch (parseErr){
        throw new Error("Received a response that could not be read as valid data.");
      }

      if (!Array.isArray(data)){
        throw new Error("Unexpected data shape from price service.");
      }

      state.coins = data.map(function(c){
        return {
          id: c.id,
          name: c.name,
          symbol: c.symbol,
          image: c.image,
          current_price: c.current_price,
          price_change_percentage_24h: c.price_change_percentage_24h,
          market_cap: c.market_cap
        };
      });

      state.status = state.coins.length ? "ready" : "empty";
      setConnState("online", "Connected");
      els.lastUpdated.textContent = "Last updated: " + new Date().toLocaleTimeString();
      buildTape(state.coins);
    } catch (err){
      var friendly = "We couldn't reach the price service.";
      if (err && err.name === "AbortError"){
        friendly = "The connection is too slow right now and the request timed out.";
      } else if (err instanceof TypeError){
        friendly = "No network connection detected. Check the connection and try again.";
      }
      state.status = "error";
      state.errorMessage = friendly;
      setConnState("offline", "Connection issue");
    } finally {
      els.refreshBtn.disabled = false;
      applyFilterAndSort();
      render();
    }
  }

  /* ---------------- Filtering / sorting ---------------- */
  function applyFilterAndSort(){
    var q = state.query.trim().toLowerCase();
    var list = state.coins.slice();

    if (q.length){
      list = list.filter(function(c){
        return c.name.toLowerCase().indexOf(q) !== -1 ||
               c.symbol.toLowerCase().indexOf(q) !== -1;
      });
    }

    list.sort(function(a, b){
      var av = a[state.sortKey];
      var bv = b[state.sortKey];
      if (state.sortKey === "name"){
        av = (av || "").toLowerCase();
        bv = (bv || "").toLowerCase();
        if (av < bv) return state.sortDir === "asc" ? -1 : 1;
        if (av > bv) return state.sortDir === "asc" ? 1 : -1;
        return 0;
      }
      av = typeof av === "number" ? av : -Infinity;
      bv = typeof bv === "number" ? bv : -Infinity;
      return state.sortDir === "asc" ? av - bv : bv - av;
    });

    state.filtered = list;

    if (state.status !== "loading" && state.status !== "error"){
      state.status = state.coins.length === 0
        ? "empty"
        : (list.length === 0 ? "empty-filtered" : "ready");
    }
  }

  /* ---------------- Search input handling (validation + sanitation) ---------------- */
  var VALID_PATTERN = /^[a-zA-Z0-9\s\-\.]*$/;

  els.searchInput.addEventListener("input", function(e){
    var raw = e.target.value;
    var clean = sanitizeText(raw);

    if (raw !== clean || !VALID_PATTERN.test(raw)){
      els.searchInput.setAttribute("aria-invalid", "true");
      els.searchError.textContent = "Only letters, numbers, spaces, hyphens and periods are allowed.";
    } else {
      els.searchInput.removeAttribute("aria-invalid");
      els.searchError.textContent = "";
    }

    state.query = clean;
    applyFilterAndSort();
    render();
  });

  els.searchInput.addEventListener("change", function(){
    if (state.query){
      trackEvent("filter_applied", state.query);
    }
  });

  /* ---------------- Sort header handling ---------------- */
  document.querySelectorAll("thead th button").forEach(function(btn){
    btn.addEventListener("click", function(){
      var key = btn.getAttribute("data-sort");
      if (state.sortKey === key){
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "name" ? "asc" : "desc";
      }
      trackEvent("sort_changed", key + ":" + state.sortDir);
      applyFilterAndSort();
      render();
    });
  });

  /* ---------------- Refresh button ---------------- */
  els.refreshBtn.addEventListener("click", function(){
    trackEvent("manual_refresh");
    loadCoins(true);
  });

  /* ---------------- Ticker tape build ---------------- */
  function buildTape(coins){
    var movers = coins.slice()
      .filter(function(c){ return typeof c.price_change_percentage_24h === "number"; })
      .sort(function(a, b){
        return Math.abs(b.price_change_percentage_24h) - Math.abs(a.price_change_percentage_24h);
      })
      .slice(0, 12);

    if (!movers.length){
      els.tapeTrack.innerHTML = "";
      return;
    }

    var itemsHtml = movers.map(function(c){
      var dir = c.price_change_percentage_24h > 0 ? "up" : (c.price_change_percentage_24h < 0 ? "down" : "flat");
      var arrow = dir === "up" ? "▲" : (dir === "down" ? "▼" : "▪");
      return '<span class="tape-item">' +
        '<span class="sym">' + escapeHtml(c.symbol.toUpperCase()) + '</span>' +
        '<span>' + escapeHtml(formatUsd(c.current_price)) + '</span>' +
        '<span class="chg ' + dir + '">' + arrow + ' ' + escapeHtml(formatPct(c.price_change_percentage_24h)) + '</span>' +
        '</span>';
    }).join("");

    // duplicate once so the CSS translateX(-50%) loop is seamless
    els.tapeTrack.innerHTML = itemsHtml + itemsHtml;
  }

  /* ---------------- Rendering ---------------- */
  function renderSkeletonRows(){
    var rows = "";
    for (var i = 0; i < 6; i++){
      rows += '<tr class="skeleton-row" aria-hidden="true">' +
        '<td><div class="skeleton-block" style="width:70%"></div></td>' +
        '<td><div class="skeleton-block" style="width:50%"></div></td>' +
        '<td><div class="skeleton-block" style="width:40%"></div></td>' +
        '<td><div class="skeleton-block" style="width:60%"></div></td>' +
        '</tr>';
    }
    return rows;
  }

  function renderStateRow(kind){
    var title, sub, showRetry = false;

    if (kind === "error"){
      title = "Something went wrong loading prices";
      sub = state.errorMessage || "Please try again.";
      showRetry = true;
    } else if (kind === "empty"){
      title = "No data found";
      sub = "The price service returned no coins right now.";
      showRetry = true;
    } else { // empty-filtered
      title = "No data found";
      sub = "No coins match \u201c" + escapeHtml(state.query) + "\u201d. Try a different name or symbol.";
    }

    return '<tr><td colspan="4">' +
      '<div class="state-panel ' + (kind === "error" ? "error-panel" : "") + '" role="' + (kind === "error" ? "alert" : "status") + '">' +
        '<div class="state-title">' + title + '</div>' +
        '<div class="state-sub">' + sub + '</div>' +
        (showRetry ? '<button type="button" class="btn" id="retryBtn">Try again</button>' : '') +
      '</div>' +
    '</td></tr>';
  }

  function renderRows(){
    return state.filtered.map(function(c){
      var dir = c.price_change_percentage_24h > 0 ? "up" : (c.price_change_percentage_24h < 0 ? "down" : "flat");
      return '<tr>' +
        '<td>' +
          '<div class="coin-cell">' +
            '<img src="' + escapeHtml(c.image || "") + '" alt="" width="22" height="22" loading="lazy">' +
            '<span>' +
              '<span class="coin-name">' + escapeHtml(c.name) + '</span><br>' +
              '<span class="coin-sym">' + escapeHtml(c.symbol) + '</span>' +
            '</span>' +
          '</div>' +
        '</td>' +
        '<td class="price">' + escapeHtml(formatUsd(c.current_price)) + '</td>' +
        '<td><span class="chg-badge ' + dir + '">' + escapeHtml(formatPct(c.price_change_percentage_24h)) + '</span></td>' +
        '<td class="mcap">' + escapeHtml(formatCompactUsd(c.market_cap)) + '</td>' +
        '</tr>';
    }).join("");
  }

  function render(){
    var html;
    if (state.status === "loading"){
      html = renderSkeletonRows();
    } else if (state.status === "error"){
      html = renderStateRow("error");
    } else if (state.status === "empty"){
      html = renderStateRow("empty");
    } else if (state.status === "empty-filtered"){
      html = renderStateRow("empty-filtered");
    } else {
      html = renderRows();
    }

    els.tableBody.innerHTML = html;

    var retryBtn = document.getElementById("retryBtn");
    if (retryBtn){
      retryBtn.addEventListener("click", function(){
        trackEvent("retry_after_error");
        loadCoins(true);
      });
    }

    if (state.status === "ready"){
      els.rowCountMeta.textContent = "Showing " + state.filtered.length + " of " + state.coins.length + " coins";
    } else {
      els.rowCountMeta.textContent = "";
    }
  }

  /* ---------------- Boot + auto refresh ---------------- */
  function scheduleAutoRefresh(){
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function(){
      loadCoins(false);
    }, REFRESH_MS);
  }

  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "visible"){
      loadCoins(false);
    }
  });

  loadCoins(false);
  scheduleAutoRefresh();

})();
