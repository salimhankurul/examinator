import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { v4 as uuidv4 } from 'uuid'
import { sign, verify as JWTVerify } from 'jsonwebtoken'

import { validateSessionToken } from './authorization'
import { Response, ExaminatorResponse } from '../response'
import { examinatorBucket, ExamsTable, nanoid, streamToString } from '../utils'
import { ExamS3Item, ExamTableItem, ExamTokenMetaData } from '../types'
import { createExamInput, CreateExamInput, joinExamInput } from '../models'
import { Readable } from 'stream'

const { ACCESS_TOKEN_SECRET, EXAM_TOKEN_SECRET } = process.env

const s3 = new S3Client({})

const dynamo = new DynamoDBClient({})

// TODO valite course exists
// TODO validate user is teacher or admin
export const createExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['access-token']
    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const inputExam: CreateExamInput = createExamInput.parse(JSON.parse(event.body!))

    // generate exam id
    const examId: string = uuidv4()

    // **********
    // **********

    // generate questions ids and options ids
    const questions = inputExam.examQuestions.map((question) => ({
      questionId: nanoid(10),
      questionText: question.questionText,
      options: question.options.map((option) => ({
        optionId: nanoid(5),
        optionText: option.optionText,
        isCorrect: option.isCorrect,
      })),
    }))

    // set correct option id & remove isCorrect
    const examQuestions = questions.map((question) => ({
      ...question,
      corectOptionId: question.options.find((option) => option.isCorrect)!.optionId,
      options: question.options.map((option) => ({
        optionId: option.optionId,
        optionText: option.optionText,
      })),
    }))

    // **********
    // **********

    const s3_exam: ExamS3Item = {
      examId,
      examQuestions,
    }

    // **********
    // **********

    delete inputExam.examQuestions

    const questionsMetaData = {}

    for (const question of examQuestions) {
      questionsMetaData[question.questionId] = question.options.map((option) => option.optionId)
    }

    const db_exam: ExamTableItem = {
      ...inputExam,
      examId,
      sessions: {
        "admin": 'admin',
      },
      questionsMetaData,
      createdAt: new Date().toISOString(),
      createdBy: auth.userId,
    }

    // **********
    // **********

    const workes = [
      s3.send(
        new PutObjectCommand({
          Bucket: examinatorBucket,
          Key: `exams/${inputExam.courseId}/${examId}.json`,
          Body: JSON.stringify(s3_exam),
        }),
      ),
      dynamo.send(
        new PutCommand({
          TableName: ExamsTable,
          Item: db_exam,
        }),
      ),
    ]

    await Promise.all(workes)

    // **********
    // **********

    return new Response({ statusCode: 200, body: { success: true, exam: db_exam } }).response
  } catch (error) {
    console.log(error)
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

// TODO: validate user can join this exam
// TODO: make sure remove correct option id
// TODO: dont keep sessions in db, dont have sessions at all
export const joinExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }
    const _token = event.headers['access-token']

    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)
    
    const { examId, courseId } = joinExamInput.parse(JSON.parse(event.body!))

    const examGetDB = await dynamo.send(
      new GetCommand({
        TableName: ExamsTable,
        Key: {
          examId,
          courseId,
        },
      }),
    )

    const exam = examGetDB.Item as ExamTableItem

    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examId, courseId } })
    }

    if (!exam.sessions[auth.userId]) {
      const examTokenExp = (exam.duration + exam.startDate) * 1000

      if (examTokenExp < Date.now()) {
        throw new Response({ statusCode: 400, message: 'Exam token expiration date is in the past', addons: { examTokenExp } })
      }

      const tokenData: ExamTokenMetaData = {
        examId,
        courseId,
        userId: auth.userId,
      }

      const examToken = sign(tokenData, EXAM_TOKEN_SECRET, { expiresIn: examTokenExp })

      exam.sessions[auth.userId] = examToken
      // **********
      // **********

      const examUpdateDB = await dynamo.send(
        new UpdateCommand({
          TableName: ExamsTable,
          Key: {
            examId,
            courseId,
            UpdateExpression: "SET #attr1 = :val1",
            ExpressionAttributeNames: {
              "#attr1": "sessions"
            },
            ExpressionAttributeValues: {
              ":val1": { M: exam.sessions }
            }
          },
        }),
      )

      if (!examUpdateDB.Attributes) {
        throw new Response({ statusCode: 400, message: 'Error updating exam sessions', addons: { examId, courseId } })
      }
    }

    const s3_exam = await s3.send(
      new GetObjectCommand({
        Bucket: examinatorBucket,
        Key: `exams/${courseId}/${examId}.json`,
      }),
    )

    const examData: ExamS3Item = JSON.parse(await streamToString(s3_exam.Body as Readable))

    // for (const question of examData.examQuestions) {
    //   delete question.correctOptionId
    // }

    return new Response({ statusCode: 200, body: { success: true, data: { token: exam.sessions[auth.userId], data: examData } } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}

// export const deleteExam = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
//   try {
//     if (event.requestContext.http.method === 'OPTIONS') {
//       return new Response({ statusCode: 200, body: {} }).response
//     }

//     const _token = event.headers['access-token']

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
