// Boot dell'app: il routing completo menù ⇄ gioco arriva in Task 8.
import './pwa';
import '@/styles.css';
import { mostraMenu } from '@/app/menu';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Elemento #app mancante in index.html');

mostraMenu(app, () => {
  alert('gioco in arrivo');
});
