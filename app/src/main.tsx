import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "@uswds/uswds/css/uswds.min.css"
import "./index.css"
import App from "./App.tsx"
import { CopilotRuntimeProvider } from "./copilotRuntimeContext"
import { HolidayThemeProvider } from "./holidayThemeContext"
import { DesignThemeProvider } from "./designThemeContext"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DesignThemeProvider>
        <HolidayThemeProvider>
          <CopilotRuntimeProvider>
            <App />
          </CopilotRuntimeProvider>
        </HolidayThemeProvider>
      </DesignThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
