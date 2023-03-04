import { z } from 'zod'

export const userType = z.enum(['admin', 'teacher', 'student'])

export const user = z.object({
    email: z.string().email(),
    password: z.string(),
    type: userType,
    id: z.string(),
})
export type User = z.infer<typeof user>

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