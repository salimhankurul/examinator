import { Readable } from 'stream'

export const examinatorBucket = 'examinator-bucket'
export const authenticationsTableName = 'Authentications'
export const userSessionsTableName = 'UserSessions'
export const usersTableName = 'Users'
export const examsTableName = 'Exams'
export const examSessionsTableName = 'ExamSessions'

export const getExamQuestionsS3Path = (courseId: string, examId: string) => `exams/${courseId}/${examId}/questions.json`

export const streamToString = (stream: Readable): Promise<string> => {
  const chunks: any[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

export function nanoid(length: number): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * alphabet.length)
    result += alphabet[randomIndex]
  }

  return result
}

export const getExamStartTime = (start: string,): number => {
  return new Date(start).getTime()
}

export const getExamFinishTime = (start: string, duration: number): number => {
  return (duration * 60 * 1000) + getExamStartTime(start)
}

// execute after 5 seconds to make sure the exam is finished
export const getExamFinishExecuteAtDate = (start: string, duration: number): string => {
  return new Date(getExamFinishTime(start, duration) + 5000).toISOString()
}

export const getExamTokenExpirationTime = (start: string, duration: number): number => { // in seconds
  return ((getExamFinishTime(start, duration) - new Date().getTime()) / 1000) | 0
}

export const examFinished = (start: string, duration: number): boolean => {
  const now = Date.now()
  return now - getExamFinishTime(start, duration) > 0
}

export const examStarted = (start: string): boolean => {
  const now = Date.now()
  return now - getExamStartTime(start) > 0
}