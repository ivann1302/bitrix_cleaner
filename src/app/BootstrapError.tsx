interface BootstrapErrorProps {
  readonly onReload?: () => void;
}

export function BootstrapError({
  onReload = () => window.location.reload(),
}: BootstrapErrorProps) {
  return (
    <main className="app-shell">
      <section className="page" aria-labelledby="bootstrap-error-title">
        <p className="eyebrow">Bitrix24 · ошибка подключения</p>
        <h1 id="bootstrap-error-title">Не удалось открыть CRM Cleaner</h1>
        <p className="status-panel error" role="alert">
          Не удалось получить контекст Bitrix24. Откройте приложение из портала
          и повторите попытку. Никакие данные не изменялись.
        </p>
        <button className="secondary-button" type="button" onClick={onReload}>
          Повторить
        </button>
      </section>
    </main>
  );
}
