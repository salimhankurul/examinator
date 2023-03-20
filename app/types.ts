import { z } from 'zod'

export const userType = z.enum(['admin', 'teacher', 'student'])

// **********  Courses  **********
// **********  Courses  **********
// **********  Courses  **********

export const courses = [
  { id: 'COME125', name: 'Introduction to Computer Science' },
  { id: 'COME225', name: 'Data Structures and Algorithms' },
  { id: 'COME325', name: 'Computer Networks' },
  { id: 'COME425', name: 'Database Systems' },
  { id: 'COME525', name: 'Operating Systems' },
  { id: 'COME625', name: 'Software Engineering' },
  { id: 'COME725', name: 'Artificial Intelligence' },
  { id: 'COME825', name: 'Computer Graphics' },
  { id: 'COME925', name: 'Computer Architecture' },
  { id: 'COME1025', name: 'Programming Languages' },
];
// **********  Authentication  **********
// **********  Authentication  **********
// **********  Authentication  **********

export const authenticationTableItem = z.object({
  email: z.string().email(),
  password: z.string(),
  userId: z.string(),
})
export type AuthenticationTableItem = z.infer<typeof authenticationTableItem>

// **********  Users  **********
// **********  Users  **********
// **********  Users  **********

export const usersTableItem = z.object({
  userId: z.string(),
  userType: userType,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  courses: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
})
export type UsersTableItem = z.infer<typeof usersTableItem>

// **********  UserSession  **********
// **********  UserSession  **********
// **********  UserSession  **********

export const sessionTableItem = z.object({
  userId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.number(),
})
export type SessionTableItem = z.infer<typeof sessionTableItem>

// **********  Exam Token **********
// **********  Exam Token **********
// **********  Exam Token **********

export interface ExamTokenMetaData {
  examId: string
  courseId: string
  userId: string
}

// **********  Exam DB **********
// **********  Exam DB **********
// **********  Exam DB **********

export const examTableItem = z.object({
  examId: z.string(),
  courseId: z.string(),
  name: z.string(),
  courseName: z.string(),
  description: z.string(),
  minimumPassingScore: z.number(),
  startDate: z.number(),
  duration: z.number(),
  createdAt: z.string(),
  createdBy: z.string(),
  questionsMetaData: z.record(z.string(), z.array(z.string())),
})
export type ExamTableItem = z.infer<typeof examTableItem>

// **********  Exam S3 **********
// **********  Exam S3 **********
// **********  Exam S3 **********

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

// **********  ExamSession  **********
// **********  ExamSession  **********
// **********  ExamSession  **********

export const examSessionTableItem = z.object({
  examId: z.string(),
  userId: z.string(),
  userExamToken: z.string(),
  userAnswers: z.record(z.string(), z.string()),
})
export type ExamSessionTableItem = z.infer<typeof examSessionTableItem>

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
