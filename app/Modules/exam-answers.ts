import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Response, ExaminatorResponse } from '../response'
import { validateExamToken, validateSessionToken } from './authorization'
import { answersTable, ExamsTable } from '../utils'
import { submitAnswerInput } from '../models'
import { ExamTableItem } from '../types'

const { ACCESS_TOKEN_SECRET, EXAM_TOKEN_SECRET } = process.env

const dynamo = new DynamoDBClient({})

// TODO: make this work
export const submitExamAnswer = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const accessToken = event.headers['access-token']
    const examToken = event.headers['exam-token']
    
    const auth = await validateSessionToken(accessToken, ACCESS_TOKEN_SECRET)

    // this will handle -> is exam exist & is exam time ended
    const examAuth = await validateExamToken(examToken, EXAM_TOKEN_SECRET)

    const { questionId, optionId } = submitAnswerInput.parse(JSON.parse(event.body!))

    const examDB = await dynamo.send(
      new GetCommand({
        TableName: ExamsTable,
        Key: {
          examId: examAuth.examId,
          courseId: examAuth.courseId,
        },
      }),
    )
    
    const exam = examDB.Item as ExamTableItem
    
    if (!exam) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt exist !', addons: { examAuth } })
    }

    if (!exam.questionsMetaData[questionId] || !exam.questionsMetaData[questionId].includes(optionId)) {
      throw new Response({ statusCode: 400, message: 'This exam doesnt have this question or this question doesnt have this option', addons: { examId: examAuth.examId, questionId, optionId } })
    }

    // const putCommand = new PutCommand({
    //   TableName: answersTable,
    //   Item: {
    //     examId: examAuth.examId,
    //     userId: auth.userId,
    //     answers: [{ questionId, answerId: optionId }]
    //   },
    //   ConditionExpression: 'attribute_not_exists(examId) OR attribute_not_exists(userId)'
    // })

    // const updateCommand = new UpdateCommand({
    //   TableName: answersTable,
    //   Key: {
    //     examId: examAuth.examId,
    //     userId: auth.userId,
    //   },
    //   UpdateExpression: 'SET #answers = list_append(#answers, :answer)',
    //   ExpressionAttributeNames: {
    //     '#answers': 'answers'
    //   },
    //   // ExpressionAttributeValues: {
    //   //   ':answer': { L: [{ M: { questionId: { S: questionId }, answerId: { N: answerId.toString() } } }] }
    //   // }
    // })

    // try {
    //   await dynamo.send(putCommand)
    // } catch (putError) {
    //   if (putError.code === 'ConditionalCheckFailedException') {
    //     await dynamo.send(updateCommand)
    //   } else {
    //     throw putError
    //   }
    // }

    return new Response({ statusCode: 200, body: { success: true } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
