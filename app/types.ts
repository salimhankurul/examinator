import { z } from 'zod'

export const userType = z.enum(['admin', 'teacher', 'student'])

export const course = z.object({
  label: z.string(),
  value: z.string(),
})
export type Course = z.infer<typeof course>

// **********  DB  **********
// **********  DB  **********
// **********  DB  **********

export const authenticationTableItem = z.object({
  email: z.string().email(),
  password: z.string(),
  userId: z.string(),
})
export type AuthenticationTableItem = z.infer<typeof authenticationTableItem>

export const userProfileItem = z.object({
  userId: z.string(),
  userType: userType,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  courses: z.array(course),
})
export type UserProfileItem = z.infer<typeof userProfileItem>

export const sessionTableItem = z.object({
  userId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
})
export type SessionTableItem = z.infer<typeof sessionTableItem>

// **********  Exam  **********
// **********  Exam  **********
// **********  Exam  **********

export interface ExamTokenMetaData {
  examId: string
  courseId: string
  userId: string
}

// **********  Exam on DB start  **********

export const examTableItem = z.object({
  examId: z.string(),
  name: z.string(),
  description: z.string(),
  courseName: z.string(),
  courseId: z.string(),
  minimumPassingScore: z.number(),
  startDate: z.number(),
  duration: z.number(),
  createdAt: z.string(),
  createdBy: z.string(),
  questionsMetaData: z.record(z.string(), z.array(z.string())),
  sessions: z.record(z.string(), z.string()),
})
export type ExamTableItem = z.infer<typeof examTableItem>

// **********  Exam on DB end  **********

// **********  Exam on S3 start **********

export const examOption = z.object({
  optionId: z.string(),
  optionText: z.string(),
})

export const examsQuestion = z.object({
  questionId: z.string(),
  questionText: z.string(),
  correctOptionId: z.string(),
  options: z.array(examOption),  
})

export const examS3Item = z.object({
  examId: z.string(),
  examQuestions: z.array(examsQuestion),
})
export type ExamS3Item = z.infer<typeof examS3Item>

// **********  Exam on S3 end **********

// **********  start ExamAnswerTableItem DB **********

const examQuestion = z.object({
  questionId: z.string(),
  optionsIds: z.array(z.string()),
})

const userAnswer = z.object({
  questionId: z.string(),
  optionId: z.string(),
})

export const examAnswerTableItem = z.object({
  examId: z.string(),
  examQuestions: z.array(examQuestion),
  userId: z.string().optional(),
  userAnswers: z.array(userAnswer).optional(),
})
export type ExamAnswerTableItem = z.infer<typeof examAnswerTableItem>

// **********  end ExamAnswerTableItem DB **********

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
