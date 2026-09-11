import { useEffect, useRef, useState } from "react";
import { createCrmCsv } from "../domain/dealCsv";
import { ENTITY_COPY } from "../domain/entityCopy";
import type { CrmEntity, CrmItem } from "../domain/types";

interface DealCsvExportProps {
  readonly entity: CrmEntity;
  readonly items: readonly CrmItem[];
  readonly excludedIds: ReadonlySet<string>;
}

export function DealCsvExport({
  entity,
  items,
  excludedIds,
}: DealCsvExportProps) {
  const [failed, setFailed] = useState(false);
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const selected = items.filter((deal) => !excludedIds.has(deal.id)).length;

  useEffect(() => {
    const pending = downloads.current;
    return () => {
      for (const [url, timer] of pending) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      pending.clear();
    };
  }, []);

  function download() {
    if (selected === 0) return;
    setFailed(false);
    let url: string | undefined;
    const link = document.createElement("a");
    try {
      const blob = new Blob([createCrmCsv(entity, items, excludedIds)], {
        type: "text/csv;charset=utf-8",
      });
      url = URL.createObjectURL(blob);
      link.href = url;
      link.download =
        entity === "deal" ? "crm-cleaner-deals.csv" : "crm-cleaner-leads.csv";
      document.body.append(link);
      link.click();
      // Give the browser time to begin consuming the download before releasing it.
      const downloadUrl = url;
      downloads.current.set(
        downloadUrl,
        setTimeout(() => {
          URL.revokeObjectURL(downloadUrl);
          downloads.current.delete(downloadUrl);
        }, 1000),
      );
    } catch {
      if (url !== undefined) URL.revokeObjectURL(url);
      setFailed(true);
    } finally {
      link.remove();
    }
  }

  return (
    <div>
      <button
        className="secondary-button"
        type="button"
        disabled={selected === 0}
        onClick={download}
      >
        Скачать CSV ({selected})
      </button>
      <p className="demo-note">
        CSV содержит поля выбранных {ENTITY_COPY[entity].many} со всех страниц.
        Это не полная резервная копия CRM.
      </p>
      {failed && (
        <p role="alert">
          Не удалось подготовить CSV. Попробуйте скачать ещё раз.
        </p>
      )}
    </div>
  );
}
