import { z } from 'zod'
import { userType } from './types'

export const registerInput = z.object({
  email: z.string().email(),
  password: z.string(),
  userType,
})

export const signInInput = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const signOutInput = z.object({
  userId: z.string(),
})
