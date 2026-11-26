(() => {
  const secretPattern = /^[A-Za-z0-9_-]{43}$/;
  const fragmentPattern = /^#invite=([A-Za-z0-9_-]{43})$/;

  function takeFragment() {
    const hash = window.location.hash;
    if (hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return { present: Boolean(hash), secret: hash.match(fragmentPattern)?.[1] };
  }

  const initialFragment = takeFragment();

  function readRecoveryValue(value, canonical) {
    const candidate = value.trim();
    if (secretPattern.test(candidate)) return candidate;
    try {
      const link = new URL(candidate);
      if (link.origin !== canonical.origin || link.pathname !== canonical.pathname ||
        link.username || link.password || link.search) return undefined;
      return link.hash.match(fragmentPattern)?.[1];
    } catch {
      return undefined;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("invitation-form");
    const messages = document.getElementById("invitation-messages");
    const status = document.getElementById("invitation-status");
    const recovery = document.getElementById("recovery");
    const input = document.getElementById("recovery-value");
    const buttons = form.querySelectorAll("button");
    const canonical = new URL(form.dataset.invitationUrl);
    const destinations = new Map([
      ["register", "/caster-studio/sign-up"],
      ["sign-in", "/caster-studio/sign-in"],
      ["continue", "/caster-studio"],
    ]);
    const retryable = new Set(["limited", "unavailable"]);
    let fragmentSecret = initialFragment.secret;
    initialFragment.secret = undefined;
    let preparation;

    function updateStatus(key) {
      const message = Array.from(messages.content.children).find((item) => item.dataset.status === key);
      status.textContent = message?.textContent || "";
      status.hidden = !message;
      status.dataset.state = key ?? "";
    }

    function setBusy(value) {
      form.setAttribute("aria-busy", String(value));
      buttons.forEach((button) => { button.disabled = value; });
    }

    setBusy(false);
    if (!fragmentSecret) updateStatus(initialFragment.present ? "invalid" : "lost");

    window.addEventListener("hashchange", () => {
      const fragment = takeFragment();
      if (!fragment.present) return;
      preparation?.abort();
      preparation = undefined;
      fragmentSecret = fragment.secret;
      input.value = "";
      setBusy(false);
      updateStatus(fragmentSecret ? undefined : "invalid");
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (preparation) return;
      const destination = destinations.get(event.submitter?.value) ?? "/caster-studio";
      const enteredValue = input.value.trim();
      const secret = enteredValue ? readRecoveryValue(enteredValue, canonical) : fragmentSecret;
      if (!secret) {
        updateStatus(enteredValue ? "invalid" : "lost");
        recovery.open = true;
        input.focus();
        return;
      }

      input.value = "";
      fragmentSecret = secret;
      const request = new AbortController();
      preparation = request;
      setBusy(true);
      updateStatus("checking");
      let result = "unavailable";
      try {
        const response = await fetch("/api/caster/invitation/prepare", {
          method: "POST",
          mode: "same-origin",
          // Preserve Origin for this explicit same-origin POST without sending Referer.
          referrer: "",
          referrerPolicy: "same-origin",
          credentials: "same-origin",
          redirect: "error",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secret }),
          signal: request.signal,
        });
        const payload = await response.json();
        if (preparation !== request) return;
        if (response.ok && payload.status === "ready") {
          fragmentSecret = undefined;
          window.location.assign(destination);
          return;
        }
        result = payload.status;
      } catch {
        // Offline replies and proxy errors use the same recoverable state.
      }
      if (preparation !== request) return;
      preparation = undefined;
      if (!["invalid", "expired", "revoked", "claimed", "unavailable", "limited"].includes(result)) {
        result = "unavailable";
      }
      if (!retryable.has(result)) fragmentSecret = undefined;
      updateStatus(result);
      setBusy(false);
    });
  }, { once: true });
})();
