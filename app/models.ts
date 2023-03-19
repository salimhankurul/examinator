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
  examName: z.string(),
  examDescription: z.string(),
  examDuration: z.number(),
  examQuestions: z.array(examQuestionInput),
  examCourse: z.string(),
  examCourseId: z.string(),
  minimumPassingScore: z.number(),
  examStartTime: z.number(),
  examEndTime: z.number(),
})
export type CreateExamInput = z.infer<typeof createExamInput>

