import { z } from 'zod'

export const userType = z.enum(['admin', 'teacher', 'student'])

export const user = z.object({
    email: z.string().email(),
    password: z.string(),
    type: userType,
    id: z.string(),
})
export type UserMetaData = z.infer<typeof user>

export const tokenMetaData = z.object({
    userType: userType,
    userId: z.string(),
    IP: z.string(),
    iat: z.number(),
    exp: z.number(),
})
export type TokenMetaData = z.infer<typeof tokenMetaData>

export const validateTokenResponse = z.object({
    tokenMetaData,
    error: z.string(),
}).partial()
export type ValidateTokenResponse = z.infer<typeof validateTokenResponse>

export const verifyRes = z.object({
    email: z.string().email(),
    type: userType,
    id: z.string(),
    IP: z.string(),
    iat: z.number(),
    exp: z.number(),
    error: z.string(),
})
export type VerifyResponse = z.infer<typeof verifyRes>