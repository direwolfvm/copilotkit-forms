import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "@uswds/uswds/css/uswds.min.css"
import "./index.css"
import App from "./App.tsx"
import { CopilotRuntimeProvider } from "./copilotRuntimeContext"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CopilotRuntimeProvider>
        <App />
      </CopilotRuntimeProvider>
    </BrowserRouter>
  </StrictMode>,
)
