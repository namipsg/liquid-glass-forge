import {defineConfig} from 'vite';
export default defineConfig({build:{rollupOptions:{input:{studio:'index.html',calibration:'calibration.html',examples:'examples.html',specimen:'safari-specimen.html',support:'support.html'}}}});
