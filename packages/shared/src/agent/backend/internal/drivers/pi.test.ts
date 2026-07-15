import { describe, expect, it } from 'bun:test';
import { piDriver } from './pi.ts';

describe('piDriver.buildRuntime custom endpoint models', () => {
  it('preserves explicit per-model supportsImages values', () => {
    const runtime = piDriver.buildRuntime({
      context: {
        provider: 'pi',
        authType: 'api_key',
        resolvedModel: 'vision-model',
        capabilities: { needsHttpPoolServer: false },
        connection: {
          slug: 'custom-endpoint',
          name: 'Custom Endpoint',
          providerType: 'pi',
          authType: 'api_key',
          baseUrl: 'http://127.0.0.1:11111/v1',
          customEndpoint: { api: 'anthropic-messages', supportsImages: true },
          models: [
            { id: 'vision-model', contextWindow: 262_144, supportsImages: true },
            { id: 'text-only-model', supportsImages: false },
            { id: 'plain-model' },
          ],
          createdAt: Date.now(),
        } as any,
      },
      coreConfig: {} as any,
      hostRuntime: {} as any,
      resolvedPaths: {
        piServerPath: '/tmp/pi-agent-server.js',
        interceptorBundlePath: '/tmp/interceptor.cjs',
        nodeRuntimePath: '/usr/bin/node',
      },
    });

    expect(runtime.customModels).toEqual([
      { id: 'vision-model', contextWindow: 262_144, supportsImages: true },
      { id: 'text-only-model', supportsImages: false },
      'plain-model',
    ]);
  });

  for (const piAuthProvider of ['openai-codex', 'github-copilot']) {
    it(`strips endpoint routing from ${piAuthProvider} OAuth runtime payloads`, () => {
      const runtime = piDriver.buildRuntime({
        context: {
          provider: 'pi',
          authType: 'oauth',
          resolvedModel: 'fabricated-model',
          capabilities: { needsHttpPoolServer: false },
          connection: {
            slug: `oauth-${piAuthProvider}`,
            name: 'Server-owned OAuth',
            providerType: 'pi',
            authType: 'oauth',
            piAuthProvider,
            baseUrl: 'https://attacker.example.test/v1',
            customEndpoint: { api: 'openai-completions' },
            createdAt: 1,
          } as any,
        },
        coreConfig: {} as any,
        hostRuntime: {} as any,
        resolvedPaths: {
          piServerPath: '/tmp/pi-agent-server.js',
          interceptorBundlePath: '/tmp/interceptor.cjs',
          nodeRuntimePath: '/usr/bin/node',
        },
      });

      expect(runtime.piAuthProvider).toBe(piAuthProvider);
      expect(runtime.baseUrl).toBeUndefined();
      expect(runtime.customEndpoint).toBeUndefined();
    });
  }
});
