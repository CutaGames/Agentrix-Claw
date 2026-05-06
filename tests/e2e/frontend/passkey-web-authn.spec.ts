import { expect, test, type Page } from '@playwright/test';

const AUTH_TOKEN = String(
  process.env.PLAYWRIGHT_AUTH_TOKEN || process.env.E2E_BEARER_TOKEN || '',
).trim();
const AUTH_SKIP_HINT =
  'Set PLAYWRIGHT_AUTH_TOKEN or E2E_BEARER_TOKEN to run browser-level passkey/WebAuthn regression.';

async function seedPasskeyBrowser(page: Page, accessToken: string) {
  await page.addInitScript((token: string) => {
    localStorage.setItem('access_token', token);
    localStorage.setItem('user_roles', JSON.stringify(['user']));

    const encoder = new TextEncoder();

    function readBytes(input: unknown): Uint8Array {
      if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
      }
      if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      }
      return new Uint8Array();
    }

    function toBase64Url(input: unknown): string {
      const bytes = readBytes(input);
      let binary = '';
      bytes.forEach((value) => {
        binary += String.fromCharCode(value);
      });
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function makeClientData(type: 'webauthn.create' | 'webauthn.get', challenge: unknown) {
      return encoder.encode(JSON.stringify({
        type,
        challenge: toBase64Url(challenge),
        origin: window.location.origin,
      })).buffer;
    }

    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: function PublicKeyCredential() {},
    });

    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: () => true,
    });

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        async create(options: any) {
          return {
            id: `pw-e2e-${Date.now()}`,
            response: {
              clientDataJSON: makeClientData('webauthn.create', options?.publicKey?.challenge),
              getPublicKey: () => new Uint8Array([1, 2, 3, 4]).buffer,
              getTransports: () => ['internal'],
            },
          };
        },
        async get(options: any) {
          const allowId = options?.publicKey?.allowCredentials?.[0]?.id;
          return {
            id: allowId ? toBase64Url(allowId) : `pw-e2e-${Date.now()}`,
            response: {
              clientDataJSON: makeClientData('webauthn.get', options?.publicKey?.challenge),
              authenticatorData: new Uint8Array([5, 6, 7, 8]).buffer,
              signature: new Uint8Array([9, 10, 11, 12]).buffer,
            },
          };
        },
      },
    });
  }, accessToken);
}

test.describe('passkey webauthn browser regression', () => {
  test('registers authenticates and removes a passkey via real page + backend', async ({ page }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);

    const label = `pw-e2e-${Date.now()}`;
    await seedPasskeyBrowser(page, AUTH_TOKEN);
    await page.goto('/auth/passkey');

    await expect(page.getByTestId('pk-title')).toBeVisible();
    await expect(page.getByTestId('pk-unsupported')).toHaveCount(0);

    await page.getByTestId('pk-label').fill(label);
    await page.getByTestId('pk-register').click();
    await expect(page.getByTestId('pk-info')).toContainText('Passkey registered');

    const createdItem = page.getByTestId('pk-item').filter({ hasText: label });
    await expect(createdItem).toHaveCount(1);

    await page.getByTestId('pk-authenticate').click();
    await expect(page.getByTestId('pk-info')).toContainText('assertion_token=');

    await createdItem.getByTestId('pk-remove').click();
    await expect(createdItem).toHaveCount(0);
  });
});