import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: /** @type {'cjs'} */ ('cjs'),
  platform: /** @type {'node'} */ ('node'),
  target: 'node18',
  sourcemap: true,
  minify: !isWatch,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete');
}
