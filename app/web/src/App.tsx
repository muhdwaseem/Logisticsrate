import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  getContract,
  getContracts,
  type Contract,
  type ContractSummary,
} from './api';
import { useToast } from './components/Toast';
import { QuoteView } from './views/QuoteView';
import { SavedView } from './views/SavedView';
import { TariffView } from './views/TariffView';

export function App() {
  const toast = useToast();
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [contractId, setContractId] = useState<number | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);

  const loadContract = useCallback(
    async (id: number) => {
      try {
        setContract(await getContract(id));
      } catch (err) {
        toast('Could not load tariff: ' + (err as Error).message, true);
      }
    },
    [toast],
  );

  useEffect(() => {
    getContracts()
      .then((list) => {
        setContracts(list);
        if (list[0]) setContractId(list[0].id);
      })
      .catch((err) => toast('Startup error: ' + (err as Error).message, true));
  }, [toast]);

  useEffect(() => {
    if (contractId != null) loadContract(contractId);
  }, [contractId, loadContract]);

  const d = contract?.data?.contract ?? {};
  const label = contract
    ? [contract.name, d.currency, d.territory as string | undefined]
        .filter(Boolean)
        .join('  ·  ')
    : 'loading…';

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
              <path
                d="M3 20.5 16 26l13-5.5M3 14.5 16 20l13-5.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d="M16 6 3 11.5 16 17l13-5.5L16 6Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="brand-text">
            <strong>Freight Rate &amp; Quotation</strong>
            <small>{label}</small>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          <NavLink className="tab" to="/quote">
            New quote
          </NavLink>
          <NavLink className="tab" to="/saved">
            Saved quotes
          </NavLink>
          <NavLink className="tab" to="/tariffs">
            Tariffs
          </NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/quote" replace />} />
          <Route
            path="/quote"
            element={
              <QuoteView
                contracts={contracts}
                contractId={contractId}
                contract={contract}
                onContractChange={setContractId}
              />
            }
          />
          <Route path="/saved" element={<SavedView />} />
          <Route
            path="/tariffs"
            element={
              <TariffView
                contract={contract}
                onSaved={() => contractId != null && loadContract(contractId)}
              />
            }
          />
          <Route path="*" element={<Navigate to="/quote" replace />} />
        </Routes>
      </main>
    </>
  );
}
