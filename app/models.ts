import { z } from 'zod'
import { userType, examsQuestion, userExam, userCourse } from './types'

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
})

// TODO: isQuestionsRandomized should be optional
// TODO: isOptionsRandomized should be optional
export const createExamInput = z.object({
  name: z.string(),
  courseId: z.string(),
  description: z.string(),
  examQuestions: z.array(examQuestionInput),
  minimumPassingScore: z.number(),
  startDate: z.string(),
  duration: z.number(), // in minutes
})
export type CreateExamInput = z.infer<typeof createExamInput>

export const submitAnswerInput = z.object({
  questionId: z.string(),
  optionId: z.string(),
})

//TODO: why courseId is required?
export const joinExamInput = z.object({
  examId: z.string(),
  courseId: z.string(),
})


export const finisherExamInput = z.object({
  finisherToken: z.string().min(1),
})