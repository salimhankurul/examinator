import { ExaminatorResponse } from './custom-error'
export const createResponse = (statusCode: number, body: any): ExaminatorResponse => {
  return {
    statusCode,
    body: JSON.stringify(body),
  }
}
