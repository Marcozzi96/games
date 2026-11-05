// Menù iniziale: griglia dei giochi dal registro, pulsante mute, record.

import { giochi } from '@/core/registry';
import { caricaMute, caricaRecord } from '@/core/storage';
import { setMute } from '@/core/audio';
import type { Gioco } from '@/core/types';

export function mostraMenu(contenitore: HTMLElement, onApri: (g: Gioco) => void): void {
  contenitore.textContent = '';

  // --- Header: titolo + mute ----------------------------------------------
  const header = document.createElement('header');
  header.className = 'menu-header';

  const titolo = document.createElement('h1');
  titolo.textContent = 'Games';

  const mute = document.createElement('button');
  mute.type = 'button';
  mute.className = 'mute-btn';
  const aggiornaIcona = (): void => {
    const muto = caricaMute();
    mute.textContent = muto ? '🔇' : '🔊';
    mute.setAttribute('aria-label', muto ? 'Attiva audio' : 'Disattiva audio');
  };
  aggiornaIcona();
  mute.addEventListener('click', () => {
    setMute(!caricaMute());
    aggiornaIcona();
  });

  header.append(titolo, mute);

  // --- Griglia giochi -------------------------------------------------------
  const lista = giochi();
  const griglia = document.createElement('div');
  griglia.className = 'griglia';

  if (lista.length === 0) {
    const vuoto = document.createElement('p');
    vuoto.className = 'vuoto';
    vuoto.textContent = 'Nessun gioco ancora. I giochi arriveranno presto.';
    griglia.appendChild(vuoto);
  }

  for (const g of lista) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';

    const img = document.createElement('img');
    img.src = g.icona;
    img.alt = '';
    img.className = 'card-icona';

    const nome = document.createElement('span');
    nome.className = 'card-nome';
    nome.textContent = g.nome;

    card.append(img, nome);

    const record = caricaRecord(g.id);
    if (record > 0) {
      const rec = document.createElement('span');
      rec.className = 'card-record';
      rec.textContent = `Record: ${record}`;
      card.appendChild(rec);
    }

    card.addEventListener('click', () => onApri(g));
    griglia.appendChild(card);
  }

  contenitore.append(header, griglia);
}
