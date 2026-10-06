import { defineConfig } from 'wxt';
import removeConsole from 'vite-plugin-remove-console';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';

// The manifest version comes from package.json
const packageJson = JSON.parse(
  readFileSync(resolve('./package.json'), 'utf-8'),
);
const version = packageJson.version;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'ILLA Helper (sentence mode)',
    description: `Learn a language while you browse: an LLM swaps words, or whole sentences at your level, into the language you're learning.`,
    version,
    permissions: [
      'storage',
      'notifications',
      'contextMenus',
      'activeTab',
      'webNavigation',
    ],
    host_permissions: ['<all_urls>', 'https://api.github.com/*'],
    commands: {
      'translate-page': {
        suggested_key: {
          default: 'Alt+Z',
          mac: 'Command+Z',
        },
        description: 'Translate page',
      },
    },
  },
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  vite: (configEnv) => ({
    plugins: [
      tailwindcss(),
      VueI18nPlugin({
        include: [
          resolve(
            dirname(fileURLToPath(import.meta.url)),
            './src/i18n/locales/**',
          ),
        ],
        forceStringify: true,
        runtimeOnly: false,
        compositionOnly: true,
        fullInstall: true,
      }),
      configEnv.mode === 'production'
        ? [removeConsole({ includes: ['log', 'warn'] })]
        : [],
    ],
  }),
});
