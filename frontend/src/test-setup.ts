// Polyfill Blob.prototype.text for jsdom environment (jsdom <25 lacks Blob.text)
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// Polyfill Blob.prototype.arrayBuffer for jsdom environment (jsdom <25 lacks Blob.arrayBuffer).
// Use Response() rather than FileReader so the polyfill works under vi.useFakeTimers().
if (typeof Blob !== "undefined" && typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Response(this).arrayBuffer();
  };
}
