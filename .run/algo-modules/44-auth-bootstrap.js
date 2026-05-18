/*
 * AlgoLib module: 44-auth-bootstrap.js
 * ??????????????????
 * ???? .run/algo-lib-check.js ??????????????????????
 */

    (async function initWithAuth() {
      tickClock();
      window.setInterval(tickClock, 1000);
      bindGlobalKeys();

      const token = localStorage.getItem("algolib_token");
      if (token) {
        try {
          const resp = await fetch(BASE + "/api/v1/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (resp.ok) {
            const data = await resp.json();
            state.currentUser = data.user || data;
            localStorage.setItem("algolib_user", JSON.stringify(state.currentUser));
            hideLoginPage();
            renderNav();
            switchPage("components");
            connectSse();
            return;
          }
        } catch (_) { /* network error */ }
      }
      showLoginPage();
    })();
  
