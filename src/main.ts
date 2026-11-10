// Boot dell'app: routing semplice menù ⇄ gioco (nessun history API).
import './pwa';
import '@/styles.css';
import { mostraMenu } from '@/app/menu';
import { apriSchermo } from '@/app/screen';
import type { Gioco } from '@/core/types';
import { snake } from '@/games/snake/snake'
import { tetris } from '@/games/tetris/tetris'
import { gioco2048 } from '@/games/2048/2048'
import { pacman } from '@/games/pacman/pacman'
import { registra } from '@/core/registry'

registra(snake)
registra(tetris)
registra(gioco2048)
registra(pacman)

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
