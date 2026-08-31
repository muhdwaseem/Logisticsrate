import { useEffect, useMemo, useState } from 'react';
import { putContractData, type Contract, type Lane } from '../api';
import { useToast } from '../components/Toast';

function LaneGroup({ title, lanes }: { title: string; lanes: Lane[] }) {
  const first = lanes[0];

  if (first.breaks) {
    return (
      <div className="rate-block">
        <h3>{title}</h3>
        <table>
          <tbody>
            <tr>
              <th>Destination</th>
              <th>Min (≤100kg)</th>
              {first.breaks.map((b, i) => (
                <th key={i}>{b.upTo ? `≤${b.upTo}` : '4000+'} kg</th>
              ))}
            </tr>
            {lanes.map((l) => (
              <tr key={l.destination}>
                <td>{l.destination}</td>
                <td>{l.minCharge}</td>
                {(l.breaks ?? []).map((b, i) => (
                  <td key={i}>{b.rate}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (first.flatRates) {
    const cols = [...new Set(lanes.flatMap((l) => Object.keys(l.flatRates ?? {})))];
    return (
      <div className="rate-block">
        <h3>{title}</h3>
        <table>
          <tbody>
            <tr>
              <th>Destination</th>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
            {lanes.map((l) => (
              <tr key={l.destination}>
                <td>{l.destination}</td>
                {cols.map((c) => (
                  <td key={c}>{l.flatRates?.[c] ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="rate-block">
      <h3>{title}</h3>
      <table>
        <tbody>
          <tr>
            <th>Lane</th>
            <th>Pricing</th>
          </tr>
          {lanes.map((l) => (
            <tr key={l.destination}>
              <td>{l.destination}</td>
              <td>quote-based (manual buy rate)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TariffView({
  contract,
  onSaved,
}: {
  contract: Contract | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (contract?.data) setDraft(JSON.stringify(contract.data, null, 2));
  }, [contract]);

  const groups = useMemo(() => {
    const byType: Record<string, Lane[]> = {};
    for (const l of contract?.data?.lanes ?? []) {
      (byType[`${l.mode} · ${l.loadType}`] ||= []).push(l);
    }
    return byType;
  }, [contract]);

  if (!contract) {
    return (
      <section className="view active">
        <div className="card">
          <div className="card-head">
            <h2>Tariff</h2>
            <p className="card-sub">Loading…</p>
          </div>
        </div>
      </section>
    );
  }

  const save = async () => {
    try {
      const data = JSON.parse(draft);
      await putContractData(contract.id, data);
      setMsg('Saved. Pricing updated.');
      toast('Tariff saved');
      onSaved();
    } catch (err) {
      setMsg('Error: ' + (err as Error).message);
    }
  };

  return (
    <section className="view active">
      <div className="card">
        <div className="card-head">
          <h2>
            Tariff <small>— {contract.name}</small>
          </h2>
          <p className="card-sub">
            Lanes and accessorials in this tariff. Edit the JSON and save to update
            pricing immediately.
          </p>
        </div>

        <div id="ratesSummary">
          {Object.entries(groups).map(([k, lanes]) => (
            <LaneGroup key={k} title={k} lanes={lanes} />
          ))}
          <div className="rate-block">
            <h3>Accessorials</h3>
            <table>
              <tbody>
                <tr>
                  <th>Code</th>
                  <th>Label</th>
                  <th>Basis</th>
                  <th>Rate</th>
                  <th>When</th>
                </tr>
                {(contract.data.accessorials ?? []).map((a) => (
                  <tr key={a.code}>
                    <td>{a.code}</td>
                    <td>{a.label}</td>
                    <td>{a.basis}</td>
                    <td>
                      {a.currency} {a.rate}
                    </td>
                    <td>{a.appliesWhen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <details className="json-editor">
          <summary>Edit tariff JSON</summary>
          <textarea
            id="rateJson"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="actions">
            <button type="button" className="btn primary" onClick={save}>
              Save tariff
            </button>
            <span className="msg">{msg}</span>
          </div>
        </details>
      </div>
    </section>
  );
}
