import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyFontScale, getFontScale } from "./lib/font-scale";
import { applyTheme, getTheme } from "./lib/theme";

applyFontScale(getFontScale());
applyTheme(getTheme());

createRoot(document.getElementById("root")!).render(<App />);
