import { describe, expect, it } from 'vitest'
import { errorMessage } from './notify'

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
