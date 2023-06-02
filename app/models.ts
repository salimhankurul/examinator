import { z } from 'zod'
import dayjs from "dayjs";
import { userType, userCourse, courses } from './types'

export const registerInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  userType, // TODO: dont do it like this

  firstName: z.string().min(1),
  lastName: z.string().min(1),
  university: z.string().min(1),
  universityPersonalId: z.string().min(1),
  courses: z.array(userCourse).default([]),
})

export const forgetInput = z.object({
  email: z.string().email(),
})

export const resetPasswordInput = z.object({
  newPassword: z.string().min(1),
  newPasswordConfirm: z.string().min(1),
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
  courses: z.array(userCourse).optional(),
})

const examQuestionInput = z.object({
  questionText: z.string(),
  options: z.array(
    z.object({
      optionText: z.string(),
      isCorrect: z.boolean().optional(),
    }),
  ),
  points: z.number(),
})

export const createExamInput = z.object({
  name: z.string(),
  courseId: z.string(),
  description: z.string(),
  examQuestions: z.array(examQuestionInput),
  minimumPassingScore: z.number(),
  startDate: z.number(), // in unix timestamp (seconds)
  duration: z.number(), // in minutes
  isOptionsRandomized: z.boolean(),
  isQuestionsRandomized: z.boolean(),
})
export type CreateExamInput = z.infer<typeof createExamInput>

export const submitAnswerInput = z.object({
  questionId: z.string(),
  optionId: z.string(),
})

export const joinExamInput = z.object({
  examId: z.string(),
})

export const finisherExamInput = z.object({
  finisherToken: z.string().min(1),
})

export const getExamsInput = z.object({
  type: z.enum(['active', 'finished']),
})

export const getResultsInput = z.object({
  examId: z.string(),
})
