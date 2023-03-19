import { z } from 'zod'
import { userType, examsQuestion, course } from './types'

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
  courses: z.array(course).optional(),
})

const examQuestionInput = z.object({
  questionText: z.string(),
  options: z.array(
    z.object({
      optionText: z.string(),
      isCorrect: z.boolean().optional(),
    })
  ),
})

export const createExamInput = z.object({
  name: z.string(),
  description: z.string(),
  examQuestions: z.array(examQuestionInput),
  courseName: z.string(),
  courseId: z.string(),
  minimumPassingScore: z.number(),
  startTime: z.number(),
  duration: z.number(),
})
export type CreateExamInput = z.infer<typeof createExamInput>

