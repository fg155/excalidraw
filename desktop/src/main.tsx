import { createRoot } from "react-dom/client";

// Resolve the application entry node once; all subsequent DOM work uses its owner.
const host = document.getElementById("root");
if (!host || !host.ownerDocument.defaultView) {
  throw new Error("Application root is missing");
}
host.ownerDocument.defaultView.EXCALIDRAW_ASSET_PATH = new URL(
  ".",
  host.ownerDocument.defaultView.location.href,
).href;

// Set the local font base before the editor's font registry is evaluated.
void import("./App").then(({ DesktopApp }) => {
  createRoot(host).render(<DesktopApp host={host} />);
});
