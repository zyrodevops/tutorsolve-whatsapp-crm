import { render } from '@testing-library/react'
import { redirect } from 'next/navigation'
import Page from '@/app/page'

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

describe('Home Page', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to the login page', () => {
    render(<Page />)
    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
