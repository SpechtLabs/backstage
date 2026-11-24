import http from 'http';
import type { AddressInfo } from 'net';
import { ConfigReader } from '@backstage/config';
import { retryingOidcAuthenticator } from './tsidpAuth';

/** An IdP that is down until listen() is called, on a fixed port. */
async function flakyIdp() {
  const probe = http.createServer();
  await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address() as AddressInfo;
  await new Promise(r => probe.close(r));
  const issuer = `http://127.0.0.1:${port}`;
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        userinfo_endpoint: `${issuer}/userinfo`,
        response_types_supported: ['code'],
      }),
    );
  });
  return {
    metadataUrl: `${issuer}/.well-known/openid-configuration`,
    up: () => new Promise<void>(r => server.listen(port, '127.0.0.1', r)),
    down: () => new Promise(r => server.close(r)),
  };
}

describe('retryingOidcAuthenticator', () => {
  it('retries discovery after the IdP was unreachable', async () => {
    const idp = await flakyIdp();
    const ctx = retryingOidcAuthenticator.initialize({
      callbackUrl: 'http://localhost/callback',
      config: new ConfigReader({
        clientId: 'id',
        clientSecret: 'secret',
        metadataUrl: idp.metadataUrl,
      }),
    });
    await expect(ctx.promise).rejects.toThrow();
    await idp.up();
    try {
      const { client } = await ctx.promise;
      expect(client.issuer.metadata.issuer).toContain('127.0.0.1');
    } finally {
      await idp.down();
    }
  });
});
