import { z } from 'zod'
import { userType, userProfileItem } from './types'

export const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  userType,
})

export const signInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const signOutInput = z.object({
  userId: z.string().min(1),
})

export const updateProfileInput = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  courses: z.array(z.string().min(1)).optional(),
})
