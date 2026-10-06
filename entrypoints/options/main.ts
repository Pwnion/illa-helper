import { createApp } from 'vue';
import App from './App.vue';
import '../../assets/main.css';
import { i18n, initializeLocale } from '@/src/i18n';

const app = createApp(App);

app.use(i18n);

initializeLocale();

app.mount('#app');
