import { render, waitFor } from '@testing-library/react'
import router from 'next-router-mock'
import CallbackPage from '../src/pages/callback'
import { AuthProvider } from '../src/lib/AuthProvider'

jest.mock('next/router', () => require('next-router-mock'))

describe('login flow', () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'jwt', eligibility: true })
    })
  })

  it('stores token and redirects', async () => {
    router.setCurrentUrl('/callback?code=dummy')
    render(
      <AuthProvider>
        <CallbackPage />
      </AuthProvider>
    )
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
    expect(localStorage.getItem('id_token')).toBe('jwt')
    expect(router.asPath).toBe('/dashboard')
  })
})
