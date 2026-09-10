export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <strong>CRM Cleaner</strong>
        <span className="demo-badge">Демо-режим</span>
      </header>
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Сделки · только чтение</p>
        <h1 id="page-title">Старые проигранные сделки</h1>
        <p>Настройте условия и проверьте результат на искусственных данных.</p>
      </section>
    </main>
  );
}
