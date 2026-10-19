(() => {
  // Listen for messages from the content script
  window.addEventListener('message', (event) => {
    // Security check: ensure message is from same origin
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'ReqAtftInfo') {
      const index = event.data.idx;
      const artifacts = document.querySelectorAll('div.artifact-block-cell');
      const artifactElement = artifacts[index];

      let artifactInfo = null;

      if (artifactElement) {
        try {
          // Try to find the React Fiber key
          const key = Object.keys(artifactElement).find((k) => k.startsWith('__reactFiber'));
          if (key) {
            const fiber = artifactElement[key];
            // Navigate React props structure to find the artifact data
            // Path based on reference extension research:
            // memoizedProps -> children -> flatMap(props.properties) -> find(id)

            const children = fiber.memoizedProps?.children;
            if (Array.isArray(children)) {
              // Try to find the component with properties
              const candidate = children
                .flatMap((c) => {
                  // Sometimes structure varies, try to find props.properties
                  return c?.props?.properties ? [c.props] : [];
                })
                .find((p) => p.properties && p.properties.id);

              if (candidate) {
                artifactInfo = candidate.properties;
              }
            }

            // Fallback: Dump text content if React lookup fails, but mark as raw
            if (!artifactInfo) {
              // artifactInfo = { fallback: true, text: artifactElement.innerText };
            }
          }
        } catch (e) {
          console.error('[AI Export] Error reading React internals:', e);
        }
      }

      window.postMessage(
        {
          type: 'RspAtftInfo',
          idx: index,
          atftInfo: artifactInfo,
        },
        window.location.origin,
      );
    }
  });
})();
