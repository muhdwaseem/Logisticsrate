import { useEffect, useState, type FormEvent } from 'react';
import { putCompany, type Company } from '../api';
import { useToast } from '../components/Toast';

interface FxRow {
  cur: string;
  rate: string;
}

interface Form {
  display_name: string;
  legal_name: string;
  logo: string;
  address: string;
  city: string;
  country: string;
  tax_id: string;
  email: string;
  phone: string;
  website: string;
  base_currency: string;
  tax_mode: 'exclusive' | 'none';
  tax_label: string;
  tax_rate_pct: string;
  default_incoterm: string;
  default_validity_days: string;
  quote_prefix: string;
  quote_pad: string;
  bank_details: string;
  footer_notes: string;
}

const toForm = (c: Company): Form => ({
  display_name: c.display_name ?? '',
  legal_name: c.legal_name ?? '',
  logo: c.logo ?? '',
  address: c.address ?? '',
  city: c.city ?? '',
  country: c.country ?? '',
  tax_id: c.tax_id ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  website: c.website ?? '',
  base_currency: c.base_currency ?? 'AED',
  tax_mode: c.tax_mode ?? 'exclusive',
  tax_label: c.tax_label ?? 'VAT',
  tax_rate_pct: String(c.tax_rate_pct ?? 0),
  default_incoterm: c.default_incoterm ?? 'EXW',
  default_validity_days: String(c.default_validity_days ?? 14),
  quote_prefix: c.quote_prefix ?? 'Q',
  quote_pad: String(c.quote_pad ?? 4),
  bank_details: c.bank_details ?? '',
  footer_notes: (c.quote_footer_notes ?? []).join('\n'),
});

export function SettingsView({
  company,
  onSaved,
}: {
  company: Company | null;
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [fxRows, setFxRows] = useState<FxRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setForm(toForm(company));
    setFxRows(
      Object.entries(company.fx_rates ?? {}).map(([cur, rate]) => ({
        cur,
        rate: String(rate),
      })),
    );
  }, [company]);

  if (!form) {
    return (
      <section className="view active">
        <div className="card">
          <div className="card-head">
            <h2>Settings</h2>
            <p className="card-sub">Loading…</p>
          </div>
        </div>
      </section>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const uri = String(reader.result || '');
      if (uri.length > 64 * 1024) {
        toast('Logo must be under 64 KB', true);
        return;
      }
      set('logo', uri);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fx_rates: Record<string, number> = {};
      for (const { cur, rate } of fxRows) {
        const k = cur.trim().toUpperCase();
        if (k && Number(rate) > 0) fx_rates[k] = Number(rate);
      }
      await putCompany({
        display_name: form.display_name.trim(),
        legal_name: form.legal_name.trim(),
        logo: form.logo,
        address: form.address,
        city: form.city.trim(),
        country: form.country.trim(),
        tax_id: form.tax_id.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        website: form.website.trim(),
        base_currency: form.base_currency.trim().toUpperCase(),
        fx_rates,
        tax_mode: form.tax_mode,
        tax_label: form.tax_label.trim(),
        tax_rate_pct: Number(form.tax_rate_pct) || 0,
        default_incoterm: form.default_incoterm.trim(),
        default_validity_days: Number(form.default_validity_days) || 14,
        quote_prefix: form.quote_prefix,
        quote_pad: Number(form.quote_pad) || 4,
        bank_details: form.bank_details,
        quote_footer_notes: form.footer_notes
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        setup_complete: true,
      });
      toast('Company profile saved');
      await onSaved();
    } catch (err) {
      toast('Save failed: ' + (err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="view active">
      <form className="card form" onSubmit={onSubmit}>
        <div className="card-head">
          <h2>Company settings</h2>
          <p className="card-sub">
            Drives the app header, quote letterhead, tax wording and quote
            numbering.
          </p>
        </div>

        <div className="fg">
          <div className="fg-head">
            <h3>Identity</h3>
          </div>
          <div className="row2">
            <label className="field">
              Display name
              <input
                value={form.display_name}
                onChange={(e) => set('display_name', e.target.value)}
                placeholder="Acme Logistics"
              />
            </label>
            <label className="field">
              Legal name
              <input
                value={form.legal_name}
                onChange={(e) => set('legal_name', e.target.value)}
                placeholder="Acme Logistics LLC"
              />
            </label>
          </div>
          <label className="field">
            Logo (PNG or SVG, under 64 KB)
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              onChange={(e) => onLogo(e.target.files?.[0])}
            />
          </label>
          {form.logo && <img className="logo-preview" src={form.logo} alt="logo preview" />}
          {form.logo && (
            <button
              type="button"
              className="link"
              onClick={() => set('logo', '')}
            >
              remove logo
            </button>
          )}
          <label className="field">
            Address
            <textarea
              rows={3}
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </label>
          <div className="row2">
            <label className="field">
              City
              <input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
              />
            </label>
            <label className="field">
              Country
              <input
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
              />
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Tax ID (VRN / GST No. / EIN)
              <input
                value={form.tax_id}
                onChange={(e) => set('tax_id', e.target.value)}
              />
            </label>
            <label className="field">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </label>
          </div>
          <div className="row2">
            <label className="field">
              Phone
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </label>
            <label className="field">
              Website
              <input
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="fg">
          <div className="fg-head">
            <h3>Money &amp; tax</h3>
          </div>
          <div className="row3">
            <label className="field">
              Base currency
              <input
                value={form.base_currency}
                maxLength={3}
                onChange={(e) => set('base_currency', e.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              Tax mode
              <select
                value={form.tax_mode}
                onChange={(e) =>
                  set('tax_mode', e.target.value as 'exclusive' | 'none')
                }
              >
                <option value="exclusive">Exclusive (add tax)</option>
                <option value="none">None (no tax line)</option>
              </select>
            </label>
            <label className="field">
              Tax label
              <input
                value={form.tax_label}
                onChange={(e) => set('tax_label', e.target.value)}
                placeholder="VAT / GST / Sales Tax"
                disabled={form.tax_mode === 'none'}
              />
            </label>
          </div>
          <label className="field" style={{ maxWidth: 200 }}>
            Tax rate %
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.tax_rate_pct}
              onChange={(e) => set('tax_rate_pct', e.target.value)}
              disabled={form.tax_mode === 'none'}
            />
          </label>

          <div className="fg-head" style={{ marginTop: 8 }}>
            <h3>FX rates (units per 1 {form.base_currency || 'base'})</h3>
          </div>
          <div className="kv-editor">
            {fxRows.map((row, i) => (
              <div className="kv-row" key={i}>
                <input
                  placeholder="USD"
                  maxLength={3}
                  value={row.cur}
                  onChange={(e) =>
                    setFxRows((rows) =>
                      rows.map((r, ri) =>
                        ri === i
                          ? { ...r, cur: e.target.value.toUpperCase() }
                          : r,
                      ),
                    )
                  }
                />
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  placeholder="3.6725"
                  value={row.rate}
                  onChange={(e) =>
                    setFxRows((rows) =>
                      rows.map((r, ri) =>
                        ri === i ? { ...r, rate: e.target.value } : r,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="rm"
                  title="remove"
                  onClick={() =>
                    setFxRows((rows) => rows.filter((_, ri) => ri !== i))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="link"
            onClick={() => setFxRows((rows) => [...rows, { cur: '', rate: '' }])}
          >
            + add currency
          </button>
        </div>

        <div className="fg">
          <div className="fg-head">
            <h3>Quotation</h3>
          </div>
          <div className="row3">
            <label className="field">
              Quote prefix
              <input
                value={form.quote_prefix}
                onChange={(e) => set('quote_prefix', e.target.value)}
                placeholder="Q or ACME-"
              />
            </label>
            <label className="field">
              Ref zero-pad
              <input
                type="number"
                min="1"
                max="8"
                value={form.quote_pad}
                onChange={(e) => set('quote_pad', e.target.value)}
              />
            </label>
            <label className="field">
              Default incoterm
              <input
                value={form.default_incoterm}
                onChange={(e) => set('default_incoterm', e.target.value)}
              />
            </label>
          </div>
          <label className="field" style={{ maxWidth: 200 }}>
            Default validity (days)
            <input
              type="number"
              min="1"
              value={form.default_validity_days}
              onChange={(e) => set('default_validity_days', e.target.value)}
            />
          </label>
          <label className="field">
            Bank details (shown on the quote when set)
            <textarea
              rows={3}
              value={form.bank_details}
              onChange={(e) => set('bank_details', e.target.value)}
            />
          </label>
          <label className="field">
            Quote footer notes (one per line)
            <textarea
              rows={3}
              value={form.footer_notes}
              onChange={(e) => set('footer_notes', e.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
          <span className="hint">Ref preview: {form.quote_prefix}{new Date().getFullYear()}-{'0'.repeat(Math.max(0, (Number(form.quote_pad) || 4) - 1))}1</span>
        </div>
      </form>
    </section>
  );
}
