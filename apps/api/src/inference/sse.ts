/**
 * Minimal Server-Sent Events reader: yields the `data:` payload of each event.
 * Handles \n, \r\n and \r line endings and multi-line data fields.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>, onFirstByte?: () => void): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let data: string[] = [];
  let first = true;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (first) {
        first = false;
        onFirstByte?.();
      }
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.search(/\r\n|\r|\n/)) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + (buf[idx] === '\r' && buf[idx + 1] === '\n' ? 2 : 1));
        if (line === '') {
          if (data.length) yield data.join('\n');
          data = [];
        } else if (line.startsWith('data:')) {
          data.push(line.slice(line[5] === ' ' ? 6 : 5));
        }
        // Other fields (event:, id:, retry:, comments) are ignored.
      }
    }
    buf += decoder.decode();
    if (buf.startsWith('data:')) data.push(buf.slice(buf[5] === ' ' ? 6 : 5));
    if (data.length) yield data.join('\n');
  } finally {
    reader.releaseLock();
  }
}
