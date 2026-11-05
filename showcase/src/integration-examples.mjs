import vanilla from './starters/index.html?raw';
import react from './starters/React.jsx?raw';
import vue from './starters/Scene.vue?raw';
import angular from './starters/scene.ts?raw';

export const integrations = {
  vanilla: {
    label: 'Vanilla JS', filename: 'index.html', packages: ['dom'],
    setup: 'Use index.html in a project with a bundler such as Vite.',
    source: vanilla,
  },
  react: {
    label: 'React', filename: 'App.jsx', packages: ['react', 'dom'],
    requirements: 'React and React DOM 19.3.1',
    setup: 'Paste into App.jsx in your React app.',
    source: react,
  },
  vue: {
    label: 'Vue', filename: 'App.vue', packages: ['vue', 'dom'],
    requirements: 'Vue 3.5.44',
    setup: 'Paste into App.vue in your Vue app.',
    source: vue,
  },
  angular: {
    label: 'Angular', filename: 'glass-demo.component.ts', packages: ['angular', 'dom'],
    requirements: 'Angular core/common 22.2.4 and RxJS 7.8.2',
    setup: 'Import GlassDemoComponent, render <app-glass-demo />, and add the CSS import to src/styles.css.',
    source: angular,
  },
};

export const frameworkGuide = 'https://github.com/namipsg/liquid-glass-forge/blob/main/docs/QUICKSTART.md';
