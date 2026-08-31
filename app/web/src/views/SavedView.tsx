import { useEffect, useState } from 'react';
import {
  getQuotes,
  money,
  setQuoteStatus,
  type QuoteStatus,
  type SavedQuoteRow,
} from '../api';
import { useToast } from '../components/Toast';

const STATUSES: QuoteStatus[] = ['draft', 'sent', 'won', 'lost'];

export function SavedView() {
  const toast = useToast();
  const [rows, setRows] = useState<SavedQuoteRow[] | null>(null);

  const load = () => {
    getQuotes()
      .then(setRows)
      .catch((err) => toast('Could not load quotes: ' + (err as Error).message, true));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changeStatus = async (ref: string, status: QuoteStatus) => {
    try {
      await setQuoteStatus(ref, status);
      load();
    } catch (err) {
      toast('Update failed: ' + (err as Error).message, true);
    }
  };

  return (
    <section className="view active">
      <div className="card">
        <div className="card-head">
          <h2>Saved quotes</h2>
          <p className="card-sub">Every priced quote you kept, newest first.</p>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Lane</th>
                <th>Mode</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th aria-label="change status" />
              </tr>
            </thead>
            <tbody>
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7}>No quotes saved yet.</td>
                </tr>
              )}
              {(rows ?? []).map((q) => (
                <tr key={q.ref}>
                  <td>
                    <a
                      href={`/api/quotes/${q.ref}/print`}
                      target="_blank"
                      rel="noopener"
                    >
                      {q.ref}
                    </a>
                  </td>
                  <td>{q.customer || '—'}</td>
                  <td>
                    {(q.origin || '')} → {(q.destination || '')}
                  </td>
                  <td>
                    {q.mode} {q.load_type || ''}
                  </td>
                  <td className="num">{money(q.total, q.quote_currency || 'AED')}</td>
                  <td>
                    <span className={`pill ${q.status}`}>{q.status}</span>
                  </td>
                  <td>
                    <select
                      className="statusSel"
                      value={q.status}
                      onChange={(e) =>
                        changeStatus(q.ref, e.target.value as QuoteStatus)
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
