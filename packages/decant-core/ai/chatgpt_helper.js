if (!window.__chatgptHelperInjected) {
  window.__chatgptHelperInjected = true;

  window.capturedAuthStore = window.capturedAuthStore || {
    authorization: null,
    extraHeaders: {},
  };

  function getCookieDeviceId() {
    try {
      const match =
        typeof document !== "undefined" &&
        document.cookie.match(/oai-did=([^;]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // Hook fetch to store Authorization and custom headers when page performs network calls
  if (typeof window !== "undefined" && window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
        if (
          url &&
          (url.includes("/backend-api/") || url.includes("/api/auth/"))
        ) {
          const options = args[1];
          if (options?.headers) {
            let auth = null;
            if (options.headers instanceof Headers) {
              auth = options.headers.get("Authorization");
            } else if (typeof options.headers === "object") {
              auth =
                options.headers.Authorization || options.headers.authorization;
            }
            if (auth) {
              window.capturedAuthStore.authorization = auth;
            }
          }
        }
      } catch {
        // Ignore interception errors
      }
      return originalFetch.apply(this, args);
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== "https://chatgpt.com") return;
    if (event.data?.source !== "chatgpt-exporter-ext") return;
    if (event.data?.type !== "fetch_conversation") return;

    const { convId, token, requestId, includeImages } = event.data;

    try {
      const headers = {
        Accept: "application/json",
      };

      const authToken = token
        ? `Bearer ${token}`
        : window.capturedAuthStore?.authorization;
      if (authToken) {
        headers.Authorization = authToken;
      }

      const deviceId = getCookieDeviceId();
      if (deviceId) {
        headers["oai-device-id"] = deviceId;
      }

      const res = await fetch(
        `https://chatgpt.com/backend-api/conversation/${convId}`,
        {
          headers,
        },
      );
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      const data = await res.json();

      let images = {};
      if (includeImages) {
        const fileIds = new Set();
        const collectImagePointer = (part) => {
          if (
            part &&
            part.content_type === "image_asset_pointer" &&
            part.asset_pointer
          ) {
            fileIds.add(part.asset_pointer.split("://")[1]);
          }
        };
        // Legacy `mapping` tree shape…
        for (const node of Object.values(data.mapping || {})) {
          const msg = node.message;
          if (msg && msg.content && Array.isArray(msg.content.parts)) {
            for (const part of msg.content.parts) {
              collectImagePointer(part);
            }
          }
        }
        // …and the newer `messages` array shape.
        if (Array.isArray(data.messages)) {
          for (const msg of data.messages) {
            if (msg && msg.content && Array.isArray(msg.content.parts)) {
              for (const part of msg.content.parts) {
                collectImagePointer(part);
              }
            }
          }
        }

        const entries = await Promise.all(
          [...fileIds].map(async (id) => {
            try {
              const b64 = await fetchImageAsBase64(id, token);
              return [id, b64];
            } catch (e) {
              console.error("[AI Exporter] Error fetching image:", id, e);
              return [id, null];
            }
          }),
        );
        images = Object.fromEntries(entries.filter(([, b64]) => b64 !== null));
      }

      window.postMessage(
        { source: "chatgpt-exporter-page", requestId, data, images },
        "https://chatgpt.com",
      );
    } catch (err) {
      window.postMessage(
        { source: "chatgpt-exporter-page", requestId, error: err.message },
        "https://chatgpt.com",
      );
    }
  });

  async function fetchImageAsBase64(fileId, token) {
    try {
      const dlRes = await fetch(
        `https://chatgpt.com/backend-api/files/download/${fileId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!dlRes.ok) return null;
      const { download_url } = await dlRes.json();
      if (!download_url) return null;

      const imgRes = await fetch(download_url);
      if (!imgRes.ok) return null;

      const blob = await imgRes.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("[AI Exporter] fetchImageAsBase64 error:", e);
      return null;
    }
  }
}
