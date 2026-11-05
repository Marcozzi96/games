// Boot dell'app: il routing menù ⇄ gioco viene collegato nei task successivi.
import '@/styles.css';

const app = document.querySelector('#app');
if (!app) throw new Error('Elemento #app mancante in index.html');

app.textContent = 'Games — in costruzione';
