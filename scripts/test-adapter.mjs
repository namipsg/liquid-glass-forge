const name = process.argv[2];
if (name !== 'react' && name !== 'vue' && name !== 'angular') throw new Error('Choose an implemented adapter: react, vue or angular');
await import(`./test-${name}.mjs`);
