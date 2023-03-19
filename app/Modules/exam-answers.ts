import { APIGatewayProxyEventV2, Context } from 'aws-lambda'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { Response, ExaminatorResponse } from '../response'
import { validateSessionToken } from './authorization'
import { answersTable } from '../utils'

const { ACCESS_TOKEN_SECRET } = process.env

const dynamo = new DynamoDBClient({})

// TODO: make this work
export const submitExamAnswer = async (event: APIGatewayProxyEventV2, context: Context): Promise<ExaminatorResponse> => {
  try {
    if (event.requestContext.http.method === 'OPTIONS') {
      return new Response({ statusCode: 200, body: {} }).response
    }

    const _token = event.headers['_token']
    const auth = await validateSessionToken(_token, ACCESS_TOKEN_SECRET)

    const { examId, questionId, answerId } = JSON.parse(event.body!)

    const putCommand = new PutCommand({
      TableName: answersTable,
      Item: {
        examId: { S: examId },
        userId: { S: auth.userId },
        answers: { L: [{ M: { questionId: { S: questionId }, answerId: { N: answerId.toString() } } }] }
      },
      ConditionExpression: 'attribute_not_exists(examId) OR attribute_not_exists(userId)'
    })

    const updateCommand = new UpdateCommand({
      TableName: answersTable,
      Key: {
        examId: { S: examId },
        userId: { S: auth.userId }
      },
      UpdateExpression: 'SET #answers = list_append(#answers, :answer)',
      ExpressionAttributeNames: {
        '#answers': 'answers'
      },
      ExpressionAttributeValues: {
        ':answer': { L: [{ M: { questionId: { S: questionId }, answerId: { N: answerId.toString() } } }] }
      }
    })

    try {
      await dynamo.send(putCommand)
    } catch (putError) {
      if (putError.code === 'ConditionalCheckFailedException') {
        await dynamo.send(updateCommand)
      } else {
        throw putError
      }
    }

    return new Response({ statusCode: 200, body: { success: true } }).response
  } catch (error) {
    return error instanceof Response ? error.response : new Response({ message: 'Generic Examinator Error', statusCode: 400, addons: { error: error.message } }).response
  }
}
