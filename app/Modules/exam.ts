import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'

import { validateSessionToken } from './authorization'
import { Response, ExaminatorResponse } from '../response'
import { answersTable, examinatorBucket, streamToString } from '../utils'
import { Exam, exam, examAnswerTableItem, ExamAnswerTableItem } from '../types';
import { createExamInput, CreateExamInput } from '../models';

const { ACCESS_TOKEN_SECRET } = process.env

const s3 = new S3Client({})

const dynamo = new DynamoDBClient({})

export const createExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['_token']
    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const inputExam: CreateExamInput = createExamInput.parse(JSON.parse(event.body!))
    
    // generate exam id
    const examId: string = uuidv4()

    // generate questions ids and options ids
    const questions = inputExam.examQuestions.map(question => ({
      questionId: uuidv4(),
      questionText: question.questionText,
      options: question.options.map(option => ({
        optionId: uuidv4(),
        optionText: option.optionText,
        isCorrect: option.isCorrect,
      })),
    }))

    // set correct option id & remove isCorrect
    const cleaned_questions = questions.map(question => ({
      ...question,
      corectOptionId: question.options.find(option => option.isCorrect)!.optionId,
      options: question.options.map(option => ({
        optionId: option.optionId,
        optionText: option.optionText,
      })),
    }))

    const s3_exam: Exam = {
      ...inputExam,
      examId,
      examQuestions: cleaned_questions,
      examCreatedAt: new Date().toISOString(),
      examCreatedBy: auth.userId,
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: examinatorBucket,
        Key: `exams/${inputExam.examCourseId}/${examId}.json`,
        Body: JSON.stringify(s3_exam),
      })
    )

    const answertableItem: ExamAnswerTableItem = {
      examId,
      userId: auth.userId,
    }

    await dynamo.send(
      new PutCommand({
        TableName: answersTable,
        Item: answertableItem
      }),
    )

    return new Response({ statusCode: 200, body: { success: true, examId } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

// export const getExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
//   try {
//     if (event.requestContext.http.method === 'OPTIONS') {
//       return new Response({ statusCode: 200, body: {} }).response
//     }
//     const _token = event.headers['_token']

//     const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)
//     const examId = event.pathParameters?.examId

//     if (!examId) {
//       throw new Response({ message: 'Missing Exam ID', statusCode: 400 })
//     }

//     const exam = await s3.send(
//       new GetObjectCommand({
//         Bucket: bucketName,
//         Key: `${examId}.json`,
//       })
//     )

//     const examData: Exam = JSON.parse(await streamToString(exam.Body as Readable))

//     return new Response({ statusCode: 200, body: { success: true, data: examData } }).response
//   } catch (error) {
//     return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
//   }
// }

// export const deleteExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
//   try {
//     if (event.requestContext.http.method === 'OPTIONS') {
//       return new Response({ statusCode: 200, body: {} }).response
//     }

//     const _token = event.headers['_token']

//     const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)
//     const examId = event.pathParameters?.examId

//     if (!examId) {
//       throw new Response({ message: 'Missing Exam ID', statusCode: 400 })
//     }

//     await s3.send(
//       new DeleteObjectCommand({
//         Bucket: bucketName,
//         Key: `${examId}.json`,
//       })
//     )

//     return new Response({ statusCode: 200, body: { success: true } }).response
//   } catch (error) {
//     return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
//   }
// }