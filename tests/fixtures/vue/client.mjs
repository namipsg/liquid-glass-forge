import { createSSRApp } from 'vue';
import App from './App.vue';
import '@liquid-glass-forge/dom/styles.css';
const app=createSSRApp(App);window.hydrationErrors=[];app.config.warnHandler=message=>window.hydrationErrors.push(message);app.mount('#root');
