import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { BootstrapError } from "./app/BootstrapError";
import { createAppRuntime } from "./app/runtime";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Root element is missing");
}

const reactRoot = createRoot(root);

reactRoot.render(
  <main className="app-shell">
    <section className="page">
      <p role="status">Подключаем CRM Cleaner…</p>
    </section>
  </main>,
);

void createAppRuntime().then(
  (runtime) => {
    reactRoot.render(
      <StrictMode>
        <App
          adapter={runtime.adapter}
          context={runtime.context}
          mode={runtime.mode}
        />
      </StrictMode>,
    );
    window.addEventListener("pagehide", () => runtime.destroy(), {
      once: true,
    });
  },
  () => {
    reactRoot.render(<BootstrapError />);
  },
);
