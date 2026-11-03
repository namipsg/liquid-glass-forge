const name = process.argv[2];
if (name !== 'react' && name !== 'vue') throw new Error('Choose an implemented adapter: react or vue');
await import(`./test-${name}.mjs`);
