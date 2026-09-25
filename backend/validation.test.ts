import { describe, it, expect } from 'vitest';
import { validateRedirect, validateChallenge, screenshotKey, limitedBody, jsonBody } from './validation';
describe('Neon API boundaries', () => {
  it('accepts browser callbacks and rejects credential exfiltration URLs', () => {
    expect(validateRedirect('https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/')).toContain('chromiumapp.org');
    expect(validateRedirect('https://refer-test.extensions.allizom.org/')).toContain('allizom.org');
    for (const value of ['https://evil.com/', 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org.evil.com/', 'http://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/', 'https://user@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/', 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/?code=bad']) {
      expect(() => validateRedirect(value)).toThrow();
    }
  });
  it('rejects path traversal and invalid proof-key challenges', () => {
    expect(() => screenshotKey('../user','id','png')).toThrow();
    expect(() => validateChallenge('short')).toThrow();
    expect(validateChallenge('a'.repeat(43))).toHaveLength(43);
  });
  it('bounds streamed request size even without a content length', async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); c.close(); } });
    const req = new Request('https://example.com', { method:'POST',body:stream,duplex:'half' } as RequestInit);
    await expect(limitedBody(req,10)).rejects.toThrow('too large');
  });
  it('rejects malformed and non-object payloads', async () => {
    for (const body of ['[]','null','invalid']) {
      await expect(jsonBody(new Request('https://example.com',{method:'POST',body}))).rejects.toThrow('Invalid JSON');
    }
  });
});
