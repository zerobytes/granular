import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TEMPLATES = ['basic', 'router', 'ssr', 'ui'];

function parseArgs(args) {
  const out = { name: null, template: 'basic', force: false, mode: 'basic', completeArgs: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--template' || a === '-t') out.template = args[++i];
    else if (a === '--force' || a === '-f') out.force = true;
    else if (a === '--basic') out.mode = 'basic';
    else if (a === '--complete') out.mode = 'complete';
    else if (a === '--') {
      out.completeArgs.push(...args.slice(i + 1));
      break;
    }
    else if (!a.startsWith('-') && !out.name) out.name = a;
  }
  return out;
}

function writeFile(target, contents) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

function pkgJson(name, deps = {}) {
  return JSON.stringify({
    name,
    version: '0.1.0',
    type: 'module',
    private: true,
    scripts: {
      dev: 'npx -y -p http-server http-server -c-1 . -p 5173',
      build: 'npx -y esbuild src/main.js --bundle --minify --format=esm --outfile=dist/main.js',
    },
    dependencies: { '@granularjs/core': 'latest', ...deps },
  }, null, 2) + '\n';
}

function indexHtml(title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
`;
}

function styles() {
  return `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; line-height: 1.5; }
#app { padding: 24px; max-width: 720px; margin: 0 auto; }
button { cursor: pointer; padding: 8px 16px; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; }
button:hover { background: #f4f4f5; }
nav { display: flex; gap: 12px; padding-bottom: 16px; border-bottom: 1px solid #e4e4e7; margin-bottom: 16px; }
nav a { color: #2563eb; text-decoration: none; }
nav a.active { font-weight: 600; }
`;
}

const TEMPLATE_FILES = {
  basic(name) {
    return {
      'package.json': pkgJson(name),
      'index.html': indexHtml(name),
      'src/styles.css': styles(),
      'src/main.js': `import { bootstrap, signal, Div, H1, P, Button } from '@granularjs/core';

const count = signal(0);

bootstrap(
  Div(
    H1('Hello Granular'),
    P('Counter: ', count),
    Button({ onClick: () => count.set(count.get() + 1) }, 'Increment'),
  ),
  document.getElementById('app'),
);
`,
      'README.md': `# ${name}

Basic Granular app.

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    };
  },

  router(name) {
    return {
      'package.json': pkgJson(name),
      'index.html': indexHtml(name),
      'src/styles.css': styles(),
      'src/main.js': `import { bootstrap, createRouter, Div, H1, A, Nav } from '@granularjs/core';
import { Home } from './pages/Home.js';
import { About } from './pages/About.js';

const router = createRouter({
  routes: [
    { path: '/',      component: Home },
    { path: '/about', component: About },
  ],
});

bootstrap(
  Div(
    Nav(
      A({ href: '/',      onClick: (e) => { e.preventDefault(); router.push('/'); } },      'Home'),
      A({ href: '/about', onClick: (e) => { e.preventDefault(); router.push('/about'); } }, 'About'),
    ),
    router.outlet(),
  ),
  document.getElementById('app'),
);
`,
      'src/pages/Home.js': `import { Div, H1, P } from '@granularjs/core';

export function Home() {
  return Div(H1('Home'), P('Welcome to Granular Router.'));
}
`,
      'src/pages/About.js': `import { Div, H1, P } from '@granularjs/core';

export function About() {
  return Div(H1('About'), P('Built with @granularjs/core router.'));
}
`,
      'README.md': `# ${name}

Granular app with router.

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    };
  },

  ssr(name) {
    return {
      'package.json': JSON.stringify({
        name,
        version: '0.1.0',
        type: 'module',
        private: true,
        scripts: {
          dev: 'node server.js',
          build: 'npx -y esbuild src/client.js --bundle --minify --format=esm --outfile=public/client.js',
        },
        dependencies: { '@granularjs/core': 'latest' },
      }, null, 2) + '\n',
      'server.js': `import http from 'node:http';
import { renderToString } from '@granularjs/core';
import { App } from './src/App.js';

http.createServer(async (req, res) => {
  if (req.url === '/client.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end((await import('node:fs')).readFileSync('./public/client.js', 'utf8'));
    return;
  }
  const html = renderToString(App());
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(\`<!doctype html><html><head><title>${name}</title></head><body><div id="app">\${html}</div><script type="module" src="/client.js"></script></body></html>\`);
}).listen(3000, () => console.log('SSR listening on http://localhost:3000'));
`,
      'src/App.js': `import { Div, H1, P, signal, Button } from '@granularjs/core';

export function App() {
  const count = signal(0);
  return Div(
    H1('SSR Granular'),
    P('Hydrated count: ', count),
    Button({ onClick: () => count.set(count.get() + 1) }, 'Increment'),
  );
}
`,
      'src/client.js': `import { hydrate } from '@granularjs/core';
import { App } from './App.js';

hydrate('#app', App());
`,
      'README.md': `# ${name}

Granular SSR + hydration starter.

\`\`\`bash
npm install
npm run build
npm run dev
\`\`\`
`,
    };
  },

  ui(name) {
    return {
      'package.json': pkgJson(name, { '@granularjs/ui': 'latest' }),
      'index.html': indexHtml(name),
      'src/styles.css': styles(),
      'src/main.js': `import { bootstrap, signal, Div, H1 } from '@granularjs/core';
import { Button, TextInput, Stack, Card, Switch } from '@granularjs/ui';

const name = signal('');
const dark = signal(false);

bootstrap(
  Div(
    Card(
      Stack(
        H1('Granular UI'),
        TextInput({ label: 'Your name', value: name, onChange: (v) => name.set(v) }),
        Switch({ checked: dark, onChange: (v) => dark.set(v), label: 'Dark mode' }),
        Button({ variant: 'filled', onClick: () => alert('Hi ' + (name.get() || 'friend')) }, 'Greet'),
      ),
    ),
  ),
  document.getElementById('app'),
);
`,
      'README.md': `# ${name}

Granular UI starter with @granularjs/ui components.

\`\`\`bash
npm install
npm run dev
\`\`\`
`,
    };
  },
};

function runComplete(opts) {
  if (!opts.name) {
    console.error('Usage: granular create <appName> --complete [-- <create-granular-app args>]');
    return 1;
  }
  const args = ['-y', 'create-granular-app@latest', opts.name, ...opts.completeArgs];
  console.log(`Delegating to: npx ${args.join(' ')}\n`);
  const result = spawnSync('npx', args, { stdio: 'inherit' });
  return result.status ?? 1;
}

export async function runScaffold(args) {
  const opts = parseArgs(args);
  if (opts.mode === 'complete') return runComplete(opts);

  if (!opts.name) {
    console.error('Usage: granular create <appName> [--basic|--complete] [--template basic|router|ssr|ui]');
    console.error('  --basic     (default) minimal scaffold (1 html + 1 main.js)');
    console.error('  --complete  delegate to "npx create-granular-app" for the full template');
    return 1;
  }
  if (!TEMPLATES.includes(opts.template)) {
    console.error(`Unknown template: ${opts.template}. Valid: ${TEMPLATES.join(', ')}`);
    return 1;
  }
  const target = path.resolve(process.cwd(), opts.name);
  if (fs.existsSync(target) && !opts.force) {
    if (fs.readdirSync(target).length > 0) {
      console.error(`Directory ${opts.name} exists and is not empty. Use --force to overwrite.`);
      return 1;
    }
  }
  fs.mkdirSync(target, { recursive: true });
  const files = TEMPLATE_FILES[opts.template](opts.name);
  for (const [rel, contents] of Object.entries(files)) {
    writeFile(path.join(target, rel), contents);
  }
  console.log(`\nCreated ${opts.template} app at ./${opts.name}`);
  console.log(`  cd ${opts.name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev\n`);
  return 0;
}
