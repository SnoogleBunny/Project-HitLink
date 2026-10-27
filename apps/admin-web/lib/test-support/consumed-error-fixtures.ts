/** Hostile thrown values for actual consumer tests; no production policy lives here. */
export function consumedErrorFixtures(ownedError: Error) {
  const prototype = Object.getPrototypeOf(ownedError) as object;
  return [
    "proxy",
    "revoked proxy",
    "native proxy prototype",
    "native revoked proxy prototype",
    "forged domain prototype",
    "owned message accessor",
    "owned non-string message",
  ].map((label) => {
    let reads = 0;
    const handler: ProxyHandler<object> = {
      get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); },
      has(target, key) { reads++; return Reflect.has(target, key); },
      getPrototypeOf(target) { reads++; return Reflect.getPrototypeOf(target); },
      getOwnPropertyDescriptor(target, key) { reads++; return Reflect.getOwnPropertyDescriptor(target, key); },
    };
    let error: unknown;
    if (label === "proxy") error = new Proxy(ownedError, handler);
    else if (label === "revoked proxy") {
      const revocable = Proxy.revocable(ownedError, handler);
      error = revocable.proxy; revocable.revoke();
    } else if (label === "native proxy prototype") {
      error = Object.setPrototypeOf(new Error("Unrelated failure"), new Proxy(prototype, handler));
    } else if (label === "native revoked proxy prototype") {
      const revocable = Proxy.revocable(prototype, handler);
      error = Object.setPrototypeOf(new Error("Unrelated failure"), revocable.proxy);
      revocable.revoke();
    } else if (label === "owned non-string message") {
      error = Object.setPrototypeOf(new Error("Owned failure"), prototype);
      Object.defineProperty(error, "message", { value: { toString() { reads++; return "Do not coerce this value"; } } });
    } else {
      error = label === "forged domain prototype"
        ? Object.create(prototype) as object
        : Object.setPrototypeOf(new Error("Owned failure"), prototype);
      Object.defineProperties(error, {
        message: { configurable: true, get() { reads++; return "Do not project this getter"; } },
        code: { configurable: true, get() { reads++; return "P2034"; } },
      });
    }
    return { label, error, reads: () => reads };
  });
}
