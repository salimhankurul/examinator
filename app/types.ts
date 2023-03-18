import { z } from 'zod'

// **********  DB  **********
// **********  DB  **********
// **********  DB  **********

export const authenticationTableItem = z.object({
  email: z.string().email(),
  password: z.string(),
  userId: z.string(),
})
export type AuthenticationTableItem = z.infer<typeof authenticationTableItem>

export const userType = z.enum(['admin', 'teacher', 'student'])

export const userProfileItem = z.object({
  userId: z.string(),
  userType: userType,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  courses: z.array(z.string()),
})
export type UserProfileItem = z.infer<typeof userProfileItem>

export const sessionTableItem = z.object({
  userId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
})
export type SessionTableItem = z.infer<typeof sessionTableItem>

// **********  Token  **********
// **********  Token  **********
// **********  Token  **********

export const tokenMetaData = z.object({
  userType: userType,
  userId: z.string(),
  IP: z.string(),
  iat: z.number(),
  exp: z.number(),
})
export type TokenMetaData = z.infer<typeof tokenMetaData>

export const validateTokenResponse = z
  .object({
    tokenMetaData,
    error: z.string(),
  })
  .partial()
export type ValidateTokenResponse = z.infer<typeof validateTokenResponse>
