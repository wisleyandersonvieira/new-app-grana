import { stripAccents } from '../normalization';
import { BaseStatementParser } from './base-parser';
import type { ParsedStatementItem, ParserContext } from '../types';

// Matches a standalone date token such as "22/08" or "03/03"
const DATE_ONLY = /^\d{2}\/\d{2}$/;

// Matches a standalone Brazilian currency amount such as "930,15" or "-52,50" or "- 0,01"
const AMOUNT_ONLY = /^-\s*\d[\d.]*,\d{2}$|^\d[\d.]*,\d{2}$/;

// Category/location labels like "ALIMENTAÇÃO .MARINGA" or "TURISMO E ENTRETENIM.CAMPO MOURAO"
// These appear on the line immediately after the transaction description in Itaú PDFs.
const CATEGORY_LABEL = /\.[A-ZÀÁÂÃÇÉÊÍÓÔÕÚ][A-ZÀÁÂÃÇÉÊÍÓÔÕÚ\s]{2,}$/;

// Summary / metadata lines specific to Itaú that carry an amount but are NOT transactions.
// Tested against the accent-stripped, lower-cased version of the line.
const ITAU_NOISE = [
  /lancamentos.{0,15}(cartao|final\s*\d)/,  // "Lançamentos no cartão (final 8275)"
  /total.*lancamentos/,                       // "Total lançamentos inter."
  /total.*transacoes/,                        // "Total transações inter."
  /repasse.*iof/,                             // "Repasse de IOF em R$"
  /dolar.*conversao|conversao.*dolar/,        // "Dólar de Conversão R$ 5,65"
  /\busd\b/,                                  // lines with raw USD amounts
  /\bbrl\b/,                                  // breakdown lines from intl section (e.g. "DOVER 160,50 BRL 30,61")
  /proxima fatura/,                           // "Próxima fatura"
  /demais faturas/,                           // "Demais faturas"
];

function isItauNoise(line: string): boolean {
  const n = stripAccents(line).toLowerCase();
  return ITAU_NOISE.some((re) => re.test(n));
}

export class ItauParser extends BaseStatementParser {
  readonly bank = 'itau' as const;

  canParse(text: string): boolean {
    // Use accent-stripped comparison so "Itaú" and "Lançamentos" are matched reliably.
    const n = stripAccents(text).toLowerCase();
    return /ita[uú]/i.test(text) && (
      /resumo da fatura/.test(n) ||
      /lancamentos.*compras e saques/.test(n)
    );
  }

  parse(text: string, context: ParserContext): ParsedStatementItem[] {
    // ── 1. Isolate only the current-period transactions ───────────────────────
    // The "Compras parceladas - próximas faturas" section contains future
    // instalment lines in the exact same format as real transactions; cutting
    // the text there avoids double-counting instalments already in the bill.
    const currentText = this.sliceCurrentPeriod(text);

    // ── 2. Get clean candidate tokens (noise-filtered) ───────────────────────
    // Strip leading payment-method icon characters that pdfjs-dist extracts
    // from Itaú PDFs (e.g. the NFC/contactless symbol renders as ")))").
    // These prefixes appear before the transaction date and break date detection.
    const tokens = this.getCandidateLines(currentText)
      .map((line) => line.replace(/^[^a-zA-Z\u00C0-\u024F\d-]+/, '').trim())
      .filter((line) => line.length > 4)
      .filter((line) => !isItauNoise(line) && !CATEGORY_LABEL.test(line));

    // ── 3. Try standard line parsing ─────────────────────────────────────────
    // Works when the PDF extractor produces one complete transaction per line,
    // e.g. "22/08 VIVARA MOR 08/10 930,15".
    const lineItems = this.parseGenericPurchaseLines(tokens, context);
    if (lineItems.length > 0) return lineItems;

    // ── 4. Fallback: token-by-token reconstruction ───────────────────────────
    // Some PDF generators write each table cell as a separate text operator,
    // resulting in one token per line after extraction:
    //   "22/08"          ← date
    //   "VIVARA MOR"     ← description
    //   "08/10"          ← instalment code (looks like a date)
    //   "930,15"         ← amount
    // This step re-assembles those tokens into parseable transaction lines.
    return this.parseByTokenReconstruction(tokens, context);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Returns the portion of the statement text that contains actual current-
   * period transactions, cutting off at any section that lists future
   * instalments ("Compras parceladas – próximas faturas").
   */
  private sliceCurrentPeriod(text: string): string {
    const n = stripAccents(text).toLowerCase();
    const stop = n.search(/\bcompras parceladas\b|\bproximas faturas\b/);
    return stop > 0 ? text.slice(0, stop) : text;
  }

  /**
   * Reconstructs full transaction lines from a stream of individual tokens.
   *
   * Algorithm:
   *   - Scan for a date token (DD/MM) to start a new transaction.
   *   - Accumulate subsequent tokens as the description.
   *   - If a date-like token is encountered AFTER some description text has
   *     been collected, treat it as an instalment code (e.g. "08/10") rather
   *     than the start of a new transaction.
   *   - When an amount token is found, emit the reconstructed line.
   */
  private parseByTokenReconstruction(tokens: string[], context: ParserContext): ParsedStatementItem[] {
    const items: ParsedStatementItem[] = [];
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      // Look for the start of a transaction: a standalone date token.
      if (!DATE_ONLY.test(token)) { i++; continue; }

      const date = token;
      const descParts: string[] = [];
      let amount: string | null = null;
      i++;

      while (i < tokens.length) {
        const t = tokens[i];

        if (AMOUNT_ONLY.test(t)) {
          amount = t;
          i++;
          break;
        }

        if (DATE_ONLY.test(t)) {
          if (descParts.length === 0) {
            // No description collected yet — this is the start of the NEXT
            // transaction, not an instalment code. Abandon the current one.
            break;
          }
          // Description already started — treat this date-like token as an
          // instalment code embedded in the description (e.g. "08/10").
          descParts.push(t);
        } else {
          descParts.push(t);
        }
        i++;
      }

      if (!amount || descParts.length === 0) continue;

      const reconstructed = `${date} ${descParts.join(' ')} ${amount}`;
      const parsed = this.parseGenericPurchaseLines([reconstructed], context);
      items.push(...parsed);
    }

    return items;
  }
}
