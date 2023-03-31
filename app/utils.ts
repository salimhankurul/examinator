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