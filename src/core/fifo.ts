import type { Transaktion, Wertpapier, FifoPosten, SteuerPosition, SteuerJahr } from '../types/portfolio';

export function berechneWertpapiere(transaktionen: Transaktion[]): Record<string, Wertpapier> {
  const wertpapiere: Record<string, Wertpapier> = {};

  const sorted = [...transaktionen].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  for (const tx of sorted) {
    if (!tx.isin && !tx.wertpapierName) continue;
    if (tx.typ !== 'kauf' && tx.typ !== 'verkauf' && tx.typ !== 'dividende' && tx.typ !== 'ausschuettung') continue;

    const key = tx.isin || tx.wertpapierName;
    if (!wertpapiere[key]) {
      wertpapiere[key] = {
        isin: tx.isin,
        name: tx.wertpapierName,
        typ: 'ETF',
        waehrung: tx.waehrung,
        bestand: 0,
        durchschnittskurs: 0,
        investiert: 0,
        fifoPosten: [],
        transaktionen: [],
        dividendenGesamt: 0,
        kursHistorie: [],
      };
    }

    const wp = wertpapiere[key];
    wp.transaktionen.push(tx);

    if (tx.typ === 'kauf') {
      wp.fifoPosten.push({
        kaufDatum: tx.datum,
        stueck: tx.stueck,
        kaufkurs: tx.kurs,
        kaufbetrag: tx.betrag,
      });
      wp.bestand += tx.stueck;
      wp.investiert += tx.betrag + tx.gebuehren;
    } else if (tx.typ === 'verkauf') {
      wp.bestand -= tx.stueck;
      let remaining = tx.stueck;
      for (const posten of wp.fifoPosten) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, posten.stueck);
        const anteil = take / (take + (posten.stueck - take) || 1);
        wp.investiert -= posten.kaufbetrag * anteil;
        remaining -= take;
      }
    } else if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') {
      wp.dividendenGesamt += tx.betrag;
    }

    wp.durchschnittskurs = wp.bestand > 0 ? wp.investiert / wp.bestand : 0;
  }

  return wertpapiere;
}

export function berechneSteuerPositionen(transaktionen: Transaktion[]): SteuerPosition[] {
  const positionen: SteuerPosition[] = [];
  const fifoQueues: Record<string, FifoPosten[]> = {};

  const sorted = [...transaktionen].sort((a, b) => a.datum.getTime() - b.datum.getTime());

  for (const tx of sorted) {
    if (!tx.isin && !tx.wertpapierName) continue;
    const key = tx.isin || tx.wertpapierName;

    if (tx.typ === 'kauf') {
      if (!fifoQueues[key]) fifoQueues[key] = [];
      fifoQueues[key].push({
        kaufDatum: tx.datum,
        stueck: tx.stueck,
        kaufkurs: tx.kurs,
        kaufbetrag: tx.betrag,
      });
    } else if (tx.typ === 'verkauf') {
      const queue = fifoQueues[key] ?? [];
      let verbleibend = tx.stueck;

      while (verbleibend > 0 && queue.length > 0) {
        const posten = queue[0];
        const nimm = Math.min(verbleibend, posten.stueck);
        const kaufkurs = posten.kaufkurs;
        const verkaufkurs = tx.kurs;
        const gewinn = nimm * (verkaufkurs - kaufkurs) - (tx.gebuehren * nimm / tx.stueck);
        const haltedauer = Math.floor((tx.datum.getTime() - posten.kaufDatum.getTime()) / 86400000);

        positionen.push({
          isin: tx.isin,
          name: tx.wertpapierName,
          verkaufDatum: tx.datum,
          kaufDatum: posten.kaufDatum,
          stueck: nimm,
          kaufkurs,
          verkaufkurs,
          gewinn,
          haltedauerTage: haltedauer,
        });

        posten.stueck -= nimm;
        verbleibend -= nimm;

        if (posten.stueck <= 0.0001) {
          queue.shift();
        }
      }
    }
  }

  return positionen;
}

export function berechneSteuerJahre(transaktionen: Transaktion[]): Record<number, SteuerJahr> {
  const positionen = berechneSteuerPositionen(transaktionen);
  const jahreMap: Record<number, SteuerPosition[]> = {};
  const dividendenMap: Record<number, number> = {};

  for (const pos of positionen) {
    const j = pos.verkaufDatum.getFullYear();
    if (!jahreMap[j]) jahreMap[j] = [];
    jahreMap[j].push(pos);
  }

  for (const tx of transaktionen) {
    if (tx.typ === 'dividende' || tx.typ === 'ausschuettung') {
      const j = tx.datum.getFullYear();
      dividendenMap[j] = (dividendenMap[j] ?? 0) + tx.betrag;
    }
  }

  const alleJahre = new Set([...Object.keys(jahreMap).map(Number), ...Object.keys(dividendenMap).map(Number)]);
  const sortierteJahre = [...alleJahre].sort((a, b) => a - b);
  const result: Record<number, SteuerJahr> = {};

  let verlustvortrag = 0;

  for (const jahr of sortierteJahre) {
    const pos = jahreMap[jahr] ?? [];
    const gewinne = pos.filter(p => p.gewinn > 0).reduce((s, p) => s + p.gewinn, 0);
    const verluste = pos.filter(p => p.gewinn < 0).reduce((s, p) => s + p.gewinn, 0);
    const dividenden = dividendenMap[jahr] ?? 0;
    const saldo = gewinne + verluste + dividenden;
    const sparerPauschbetrag = jahr >= 2023 ? 1000 : 801;

    // Verlustvortrag: Negative Salden werden ins nächste Jahr übertragen
    const saldoMitVortrag = saldo + verlustvortrag;
    const steuerpflichtig = Math.max(0, saldoMitVortrag - sparerPauschbetrag);

    if (saldoMitVortrag < 0) {
      verlustvortrag = saldoMitVortrag;
    } else if (saldoMitVortrag <= sparerPauschbetrag) {
      verlustvortrag = 0;
    } else {
      verlustvortrag = 0;
    }

    const abgeltungsteuer = Math.round(steuerpflichtig * 0.25 * 100) / 100;
    const soli = Math.round(abgeltungsteuer * 0.055 * 100) / 100;

    result[jahr] = {
      jahr,
      realisierteGewinne: Math.round(gewinne * 100) / 100,
      realisierteVerluste: Math.round(verluste * 100) / 100,
      saldo: Math.round(saldo * 100) / 100,
      sparerPauschbetrag,
      steuerpflichtig: Math.round(steuerpflichtig * 100) / 100,
      abgeltungsteuer,
      soli,
      steuerGesamt: Math.round((abgeltungsteuer + soli) * 100) / 100,
      positionen: pos,
      dividenden: Math.round(dividenden * 100) / 100,
      verlustvortrag: Math.round(verlustvortrag * 100) / 100,
    };
  }

  return result;
}
