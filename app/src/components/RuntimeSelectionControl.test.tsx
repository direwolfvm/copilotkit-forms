import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { CopilotRuntimeProvider, useCopilotRuntimeSelection } from '../copilotRuntimeContext'
import RuntimeSelectionControl from './RuntimeSelectionControl'

function RuntimeModeProbe() {
  const { runtimeMode } = useCopilotRuntimeSelection()
  return <output data-testid="runtime-mode">{runtimeMode}</output>
}

function renderControl() {
  const user = userEvent.setup()
  const utils = render(
    <CopilotRuntimeProvider>
      <RuntimeSelectionControl />
      <RuntimeModeProbe />
    </CopilotRuntimeProvider>
  )

  return { user, ...utils }
}

describe('RuntimeSelectionControl', () => {
  it('defaults to the Copilot Cloud option', () => {
    renderControl()

    const select = screen.getByLabelText('Select Copilot runtime') as HTMLSelectElement
    const runtimeOutput = screen.getByTestId('runtime-mode')

    expect(select.value).toBe('default')
    expect(runtimeOutput).toHaveTextContent('default')
    expect(screen.getByText('Copilot runtime')).toBeInTheDocument()
  })

  it('switches to the Permitting ADK runtime when selected', async () => {
    const { user } = renderControl()

    const select = screen.getByLabelText('Select Copilot runtime') as HTMLSelectElement
    const runtimeOutput = screen.getByTestId('runtime-mode')

    await user.selectOptions(select, 'custom')

    expect(select.value).toBe('custom')
    expect(runtimeOutput).toHaveTextContent('custom')
  })

  it('returns to the hosted runtime when Copilot Cloud is chosen again', async () => {
    const { user } = renderControl()
    const select = screen.getByLabelText('Select Copilot runtime') as HTMLSelectElement

    await user.selectOptions(select, 'custom')
    await user.selectOptions(select, 'default')

    expect(select.value).toBe('default')
    expect(screen.getByTestId('runtime-mode')).toHaveTextContent('default')
  })
})
