import { Readable } from "stream"

export const answersTable = 'AnswersTable'
export const examinatorBucket = 'examinator-bucket'

export const streamToString = (stream: Readable): Promise<string> => {
    const chunks: any[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })
  }
  