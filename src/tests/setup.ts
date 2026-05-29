// Mock document.cookie for Node environment
if (typeof document === 'undefined') {
  let cookies: Record<string, string> = {};

  Object.defineProperty(globalThis, 'document', {
    value: {
      get cookie() {
        return Object.entries(cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      },
      set cookie(str: string) {
        // Parse the cookie string
        const [nameValue] = str.split(';');
        const eqIndex = nameValue.indexOf('=');
        if (eqIndex === -1) return;

        const encodedName = nameValue.substring(0, eqIndex).trim();
        const encodedValue = nameValue.substring(eqIndex + 1).trim();

        // Check if this is a delete operation (empty value with expires in the past)
        if (!encodedValue || str.includes('expires=Thu, 01 Jan 1970')) {
          delete cookies[encodedName];
        } else {
          cookies[encodedName] = encodedValue;
        }
      },
    },
    writable: true,
    configurable: true,
  });
}
