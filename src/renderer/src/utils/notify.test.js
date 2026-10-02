import { describe, expect, it, vi } from 'vitest'
import { errorBox, errorMessage, toastError } from './notify'

describe('errorMessage', () => {
  it('drops the prefix Electron adds to errors thrown by invoke()', () => {
    expect(errorMessage(new Error("Error invoking remote method 'projects:save': Error: EACCES: permission denied"))).toBe('EACCES: permission denied')
    expect(errorMessage(new Error("Error invoking remote method 'projects:import': SyntaxError: Unexpected token"))).toBe('Unexpected token')
    expect(errorMessage(new Error("Error invoking remote method 'projects:import': The file is not valid JSON."))).toBe('The file is not valid JSON.')
  })

  it('keeps other messages as they are', () => {
    expect(errorMessage(new Error('Something failed'))).toBe('Something failed')
    expect(errorMessage('boom')).toBe('boom')
    expect(errorMessage(new Error('Failed: Error invoking remote method x'))).toBe('Failed: Error invoking remote method x')
  })

  it('has a fallback for empty errors', () => {
    expect(errorMessage(undefined)).toBe('Unknown error')
    expect(errorMessage(new Error(''))).toBe('Unknown error')
  })
})

describe('toastError', () => {
  it('shows the readable message as a danger toast with the given title', () => {
    const vm = { $bvToast: { toast: vi.fn() } }

    toastError(vm, 'Failed to import', new Error("Error invoking remote method 'projects:import': Error: The file is not valid JSON."))

    expect(vm.$bvToast.toast).toHaveBeenCalledWith('The file is not valid JSON.', { title: 'Failed to import', variant: 'danger', solid: true, bodyClass: 'msg-pre-line' })
  })
})

describe('errorBox', () => {
  it('shows the readable message with its line breaks kept and the focus on OK', () => {
    const vm = { $bvModal: { msgBoxOk: vi.fn(() => Promise.resolve(true)) } }

    errorBox(vm, 'Failed to start SSH', 'Git Bash was not found: C:\\nope\\git-bash.exe\nCheck "Git Bash path" in Settings.')

    expect(vm.$bvModal.msgBoxOk).toHaveBeenCalledWith('Git Bash was not found: C:\\nope\\git-bash.exe\nCheck "Git Bash path" in Settings.', {
      title: 'Failed to start SSH', bodyClass: 'msg-pre-line', autoFocusButton: 'ok'
    })
  })

  it('takes errors thrown by invoke() as well', () => {
    const vm = { $bvModal: { msgBoxOk: vi.fn() } }

    errorBox(vm, 'Failed to copy', new Error("Error invoking remote method 'ssh:copyConfig': Error: Invalid host"))

    expect(vm.$bvModal.msgBoxOk.mock.calls[0][0]).toBe('Invalid host')
  })
})
