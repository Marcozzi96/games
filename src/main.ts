// Boot dell'app: routing semplice menù ⇄ gioco (nessun history API).
import './pwa';
import '@/styles.css';
import { mostraMenu } from '@/app/menu';
import { apriSchermo } from '@/app/screen';
import type { Gioco } from '@/core/types';

const trovata = document.querySelector<HTMLElement>('#app');
if (!trovata) throw new Error('Elemento #app mancante in index.html');
const app: HTMLElement = trovata;

function vaiAMenu(): void {
  mostraMenu(app, vaiAGioco);
}

function vaiAGioco(g: Gioco): void {
  apriSchermo(g, app, vaiAMenu);
}

vaiAMenu();
